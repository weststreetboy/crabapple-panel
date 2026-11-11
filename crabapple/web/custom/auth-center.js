/* =========================================================
   授权管理页增强  web/custom/auth-center.js
   ---------------------------------------------------------
   保留 Crabapple-Panel 原始的「授权管理」页面，不做替换。
   只在未授权时补一个「使用授权码激活」按钮：
     粘贴授权码 → POST /api/localAuth/activate → 刷新
   之后原始页面就会显示已授权（正式版）卡片。
   授权码在云端授权中心签发，与本机离线校验，两边不需要联网互通。
   ========================================================= */
(function () {
  "use strict";
  if (window.__spLicActivateReady) return;
  window.__spLicActivateReady = true;

  var API = "/api/localAuth";
  var BTN_ID = "sp-lic-activate-btn";
  var DIALOG_ID = "sp-lic-activate-dialog";

  /* ---------------- 工具 ---------------- */
  function getToken() {
    try {
      var raw = localStorage.getItem("AUTH_TOKEN");
      if (raw) {
        var o = JSON.parse(raw);
        var t = (o && o.data && o.data.token) || (o && o.token);
        if (t) return String(t);
      }
    } catch (e) {}
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var v = localStorage.getItem(k) || "";
        if (/token/i.test(k)) {
          try {
            var j = JSON.parse(v);
            var tk = (j && j.data && j.data.token) || (j && j.token);
            if (tk) return String(tk);
          } catch (e2) {
            if (v.length > 20) return v.replace(/^"|"$/g, "");
          }
        }
      }
    } catch (e) {}
    return "";
  }

  function activate(code) {
    var headers = { "Content-Type": "application/json" };
    var tk = getToken();
    if (tk) headers["x-sp-token"] = tk;
    return fetch(API + "/activate", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ code: code }),
    }).then(function (r) { return r.json(); });
  }

  function hostEl() {
    return document.querySelector(".app-starter-modal-content .n-layout-content .fade-in-animation");
  }

  function isAuthPage(txt) {
    if (/快速登录 Crabapple-Panel 账号|账号密码登录/.test(txt)) return true;
    // 已授权时原始页面换成 PRO 卡片，不再有"快速登录"字样，靠这些特征识别
    return /更新 Crabapple-Panel 平台账号信息/.test(txt) && /查看常见问题/.test(txt);
  }

  /* ---------------- 弹窗 ---------------- */
  function ensureStyle() {
    if (document.getElementById("sp-lic-style")) return;
    var css = [
      "#" + DIALOG_ID + "{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;",
      "background:rgba(15,23,42,.45);backdrop-filter:blur(2px);}",
      "#" + DIALOG_ID + " .sp-box{width:420px;max-width:calc(100vw - 40px);background:#fff;border-radius:12px;",
      "box-shadow:0 18px 60px rgba(0,0,0,.22);padding:20px 22px 16px;color:#2c3038;",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}",
      "#" + DIALOG_ID + " h3{margin:0 0 6px;font-size:16px;font-weight:600;}",
      "#" + DIALOG_ID + " p{margin:0 0 14px;font-size:12px;color:#8a919a;line-height:1.6;}",
      "#" + DIALOG_ID + " input{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #e6e8eb;border-radius:8px;",
      "font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.5px;outline:none;color:#2c3038;}",
      "#" + DIALOG_ID + " input:focus{border-color:#18a058;box-shadow:0 0 0 2px rgba(24,160,88,.12);}",
      "#" + DIALOG_ID + " .sp-msg{min-height:18px;margin-top:8px;font-size:12px;color:#e03e2d;}",
      "#" + DIALOG_ID + " .sp-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;}",
      "#" + DIALOG_ID + " button{border-radius:7px;padding:7px 16px;font-size:13px;cursor:pointer;border:1px solid #e6e8eb;background:#fff;color:#3d4450;}",
      "#" + DIALOG_ID + " button.sp-ok{background:#18a058;border-color:#18a058;color:#fff;font-weight:600;}",
      "#" + DIALOG_ID + " button.sp-ok:hover{background:#0f7a41;border-color:#0f7a41;}",
      "#" + DIALOG_ID + " button[disabled]{opacity:.6;cursor:not-allowed;}",
      "html.dark #" + DIALOG_ID + " .sp-box{background:#1e1e20;color:#e5e7eb;}",
      "html.dark #" + DIALOG_ID + " input{background:#252528;border-color:#33343a;color:#e5e7eb;}",
      "html.dark #" + DIALOG_ID + " button{background:#252528;border-color:#33343a;color:#d6d9de;}",
      "html.dark #" + DIALOG_ID + " button.sp-ok{background:#18a058;border-color:#18a058;color:#fff;}",
    ].join("");
    var el = document.createElement("style");
    el.id = "sp-lic-style";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function closeDialog() {
    var d = document.getElementById(DIALOG_ID);
    if (d && d.parentNode) d.parentNode.removeChild(d);
  }

  function openDialog() {
    ensureStyle();
    closeDialog();
    var box = document.createElement("div");
    box.id = DIALOG_ID;
    box.innerHTML = [
      '<div class="sp-box">',
      "  <h3>输入授权码</h3>",
      "  <p>粘贴授权码后点击激活，本机立即变为正式版。授权码在云端授权中心签发。</p>",
      '  <input id="sp-lic-input" placeholder="SPL-XXXXXX-XXXXX-XXXXX" spellcheck="false" autocomplete="off">',
      '  <div class="sp-msg" id="sp-lic-msg"></div>',
      '  <div class="sp-acts">',
      '    <button id="sp-lic-cancel">取消</button>',
      '    <button class="sp-ok" id="sp-lic-ok">激活</button>',
      "  </div>",
      "</div>",
    ].join("");
    document.body.appendChild(box);

    var input = box.querySelector("#sp-lic-input");
    var msg = box.querySelector("#sp-lic-msg");
    var okBtn = box.querySelector("#sp-lic-ok");
    input.focus();

    function submit() {
      var code = (input.value || "").trim().toUpperCase();
      if (!code) { msg.textContent = "请先粘贴授权码"; return; }
      okBtn.disabled = true;
      msg.style.color = "#8a919a";
      msg.textContent = "正在校验…";
      activate(code).then(function (res) {
        okBtn.disabled = false;
        if (!res || res.code !== 0) {
          msg.style.color = "#e03e2d";
          msg.textContent = (res && res.msg) || "激活失败，请检查授权码";
          return;
        }
        msg.style.color = "#18a058";
        msg.textContent = "激活成功，正在刷新…";
        setTimeout(function () { location.reload(); }, 700);
      }).catch(function () {
        okBtn.disabled = false;
        msg.style.color = "#e03e2d";
        msg.textContent = "网络错误，请重试";
      });
    }

    okBtn.addEventListener("click", submit);
    box.querySelector("#sp-lic-cancel").addEventListener("click", closeDialog);
    box.addEventListener("click", function (e) { if (e.target === box) closeDialog(); });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { closeDialog(); document.removeEventListener("keydown", esc); }
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }

  /* ---------------- 挂按钮 ---------------- */
  function findBar(host) {
    var anchor = null;
    var btns = host.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      if (/查看常见问题|功能比较|官网/.test(btns[i].textContent || "")) { anchor = btns[i]; break; }
    }
    return anchor ? anchor.parentNode : null;
  }

  /* 原生按钮的样式全在行内 --n-* 变量里（Vue 渲染时写死的），
     所以不能自己拼 class，只能克隆一个现成按钮再改文字。 */
  function pickTemplate(host, activated) {
    var want = activated ? ["查看常见问题", "功能比较", "官网"]
                         : ["快速登录 Crabapple-Panel 账号", "账号密码登录", "查看常见问题"];
    var btns = host.querySelectorAll("button");
    for (var w = 0; w < want.length; w++) {
      for (var i = 0; i < btns.length; i++) {
        if ((btns[i].textContent || "").indexOf(want[w]) >= 0) return btns[i];
      }
    }
    return btns[0] || null;
  }

  function setLabel(btn, label) {
    var span = btn.querySelector(".n-button__content");
    if (span) span.textContent = label;
    else btn.textContent = label;
  }

  function tick() {
    var host = hostEl();
    if (!host) return;
    var txt = host.innerText || "";
    if (!isAuthPage(txt)) {
      var old = document.getElementById(BTN_ID);
      if (old && old.parentNode) old.parentNode.removeChild(old);
      return;
    }
    if (document.getElementById(BTN_ID)) return;
    var bar = findBar(host);
    if (!bar) return;

    var activated = /到期|已登录/.test(txt);
    var tpl = pickTemplate(host, activated);
    if (!tpl) return;

    var btn = tpl.cloneNode(true);
    btn.id = BTN_ID;
    btn.type = "button";
    setLabel(btn, activated ? "更换授权码" : "使用授权码激活");
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openDialog();
    });
    bar.appendChild(btn);
  }

  function boot() {
    ensureStyle();
    setInterval(tick, 800);
    document.addEventListener("click", function () {
      setTimeout(tick, 320);
      setTimeout(tick, 900);
    }, true);
    tick();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
