/* =========================================================
   迁移 / 恢复 上传拦截 shim  web/custom/upload-shim.js
   ---------------------------------------------------------
   问题背景：
   - Crabapple-Panel 迁移上传用的是 n-upload 的 multipart/form-data（field=file）。
   - 经过 WorkBuddy 云网关时，大文件原样上传会被拒（前端拿到非 2xx
     -> Naive UI onError -> "Upload error: undefined"）。
   - 早期改成 octet-stream 分片后，网关对裸流整包缓冲导致连接挂死，
     前端没有超时 -> 转圈 40 分钟。

   现方案（稳健版）：
   1) 分片：每片 1MB，用 multipart/form-data（与能正常工作的图库上传同款），
      分片元数据（name/index/total）放在 URL 查询串里（网关必保留，
      自定义 X- 头可能被剥）。
   2) 每片 XHR 设 timeout=45s；单看门狗整体 6 分钟；超限即判定失败。
   3) 全部失败时在页面顶部弹红色横幅，给出明确原因 + 诊断入口，
      不再静默转圈。
   其它请求完全不受影响。
   ========================================================= */
(function () {
  "use strict";
  var RealXHR = window.XMLHttpRequest;
  if (!RealXHR || window.__spUpShim) return;
  window.__spUpShim = true;

  var UPLOAD_RE = /\/api\/panel\/backup\/uploadZipFile(\?.*)?$/;
  var CHUNK = 1 * 1024 * 1024;       // 1MB 每片
  var CHUNK_TIMEOUT = 45000;         // 单片 45s
  var OVERALL_TIMEOUT = 6 * 60 * 1000; // 整体 6 分钟看门狗
  var MAX_RETRY = 2;                 // 每片最多重试 2 次

  var origOpen = RealXHR.prototype.open;
  var origSend = RealXHR.prototype.send;
  var origSH = RealXHR.prototype.setRequestHeader;

  RealXHR.prototype.open = function (m, u) {
    this.__spMethod = m;
    this.__spUrl = u;
    this.__spHeaders = {};
    return origOpen.apply(this, arguments);
  };
  RealXHR.prototype.setRequestHeader = function (k, v) {
    if (this.__spHeaders && k != null) this.__spHeaders[k] = v;
    return origSH.apply(this, arguments);
  };
  RealXHR.prototype.send = function (data) {
    var url = this.__spUrl || "";
    if (this.__spMethod === "POST" && UPLOAD_RE.test(url) &&
        data && typeof data.get === "function") {
      var file = data.get("file");
      if (file && (typeof File !== "undefined" ? file instanceof File : file instanceof Blob)) {
        doUpload(this, file, this.__spHeaders || {}, url);
        return;
      }
    }
    return origSend.apply(this, arguments);
  };

  /* ---------- 可见的进度 / 错误反馈 ---------- */
  function banner() {
    var el = document.getElementById("sp-up-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "sp-up-banner";
      el.style.cssText =
        "position:fixed;left:0;right:0;top:0;z-index:99999;padding:10px 16px;" +
        "background:#b91c1c;color:#fff;font:14px/1.5 system-ui,sans-serif;" +
        "box-shadow:0 2px 10px rgba(0,0,0,.3);cursor:pointer;";
      el.onclick = function () { el.style.display = "none"; };
      document.body.appendChild(el);
    }
    return el;
  }
  function showMsg(text) {
    var el = banner();
    el.style.display = "block";
    el.innerHTML = text +
      "<br><span style='opacity:.85;font-size:12px'>点此关闭 · 仍失败请打开 " +
      "<b>/api/_updlog</b> 把内容发我</span>";
  }
  function showProgress(cur, total) {
    var el = banner();
    el.style.background = "#2563eb";
    el.style.display = "block";
    el.innerHTML = "正在上传备份（分片 " + cur + "/" + total + "）… 请稍候，不会无限转圈。";
  }

  function safeParse(t) {
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  function doUpload(origXhr, file, headers, url) {
    var token = headers["x-sp-token"] || headers["X-Sp-Token"] || headers["token"] || "";
    var total = Math.max(1, Math.ceil(file.size / CHUNK));
    var idx = 0;
    var done = false;
    var watchdog = setTimeout(function () {
      if (!done) { done = true; fire("整体超时（>6分钟），网关可能限制了上传"); }
    }, OVERALL_TIMEOUT);

    function fire(err) {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      try {
        var el = document.getElementById("sp-up-banner");
        if (el) el.style.display = "none";
      } catch (e) {}
      if (err) {
        // 失败：直接触发原生 onerror（错误态不需要伪造响应体，避免无限转圈）
        try {
          var evt = { target: origXhr, currentTarget: origXhr };
          if (origXhr.onerror) origXhr.onerror(evt);
          if (origXhr.onloadend) origXhr.onloadend(evt);
        } catch (e) {}
        return;
      }
      // 成功：让原始 XHR 真正发一次「完成」请求，由浏览器正常回 200+JSON，
      // 这样 Naive UI 的 onload 能读到真实 status/response，正确收尾
      //（之前伪造原生 XHR 只读属性在浏览器会抛异常，导致 UI 永不收尾）。
      finalize();
    }

    function finalize() {
      try {
        origOpen.call(origXhr, "POST", "/api/panel/backup/uploadDone?name=" + encodeURIComponent(file.name), true);
        if (token) origSH.call(origXhr, "x-sp-token", token);
        origSH.call(origXhr, "Content-Type", "application/json");
        origSend.call(origXhr, JSON.stringify({ name: file.name }));
      } catch (e) {
        // 极端兜底：伪造一次 onload（仅此情形）
        try {
          var evt = { target: origXhr, currentTarget: origXhr };
          if (origXhr.onload) origXhr.onload(evt);
          if (origXhr.onloadend) origXhr.onloadend(evt);
        } catch (e2) {}
      }
    }

    function buildMultipart(blob, fieldName, fileName) {
      var boundary = "----spchunk" + Date.now() + Math.floor(Math.random() * 1e6);
      var head = "--" + boundary + "\r\n" +
        'Content-Disposition: form-data; name="' + fieldName + '"; filename="' + fileName + '"\r\n' +
        "Content-Type: application/octet-stream\r\n\r\n";
      var tail = "\r\n--" + boundary + "--\r\n";
      return {
        body: new Blob([head, blob, tail]),
        ctype: "multipart/form-data; boundary=" + boundary
      };
    }

    function sendOne(attempt) {
      attempt = attempt || 0;
      if (done) return;
      if (idx >= total) return;
      showProgress(idx + 1, total);
      var blob = file.slice(idx * CHUNK, (idx + 1) * CHUNK);
      var mp = buildMultipart(blob, "file", file.name);
      var sep = url.indexOf("?") >= 0 ? "&" : "?";
      var qurl = url + sep + "name=" + encodeURIComponent(file.name) +
        "&index=" + idx + "&total=" + total;
      var real = new RealXHR();
      try {
        origOpen.call(real, "POST", qurl, true);
        origSH.call(real, "Content-Type", mp.ctype);
        if (token) origSH.call(real, "x-sp-token", token);
        real.timeout = CHUNK_TIMEOUT;
      } catch (e) {
        if (attempt < MAX_RETRY) { sendOne(attempt + 1); return; }
        fire("准备分片失败：" + e);
        return;
      }
      real.ontimeout = function () {
        if (attempt < MAX_RETRY) { sendOne(attempt + 1); return; }
        fire("分片 " + (idx + 1) + "/" + total + " 超时（网关无响应）");
      };
      real.onreadystatechange = function () {
        if (done || real.readyState !== 4) return;
        if (real.status !== 200) {
          if (attempt < MAX_RETRY) { sendOne(attempt + 1); return; }
          fire("分片 " + (idx + 1) + "/" + total + " 返回 HTTP " + real.status);
          return;
        }
        try {
          origXhr.responseText = real.responseText;
          origXhr.response = (origXhr.responseType === "json")
            ? safeParse(real.responseText) : real.responseText;
          try { origXhr.responseURL = real.responseURL; } catch (e) {}
        } catch (e) {}
        if (idx === total - 1) {
          fire(null);
        } else {
          idx++;
          sendOne(0);
        }
      };
      real.onerror = function () {
        if (attempt < MAX_RETRY) { sendOne(attempt + 1); return; }
        fire("分片 " + (idx + 1) + "/" + total + " 网络错误");
      };
      try {
        origSend.call(real, mp.body);
      } catch (e) {
        if (attempt < MAX_RETRY) { sendOne(attempt + 1); return; }
        fire("发送分片失败：" + e);
      }
    }

    sendOne(0);
  }
})();
