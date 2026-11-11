/* =========================================================
   自定义功能脚本  web/custom/features.js
   模块：
   1) 白昼 / 夜间 背景遮罩（6-18 白天，18-6 夜间，自动）
   2) 雨天 Canvas 雨效（ipapi.co 取经纬 + Open-Meteo 判雨，自动开；可手动 自动/开/关）
   3) 卡片悬停效果（缩放 / 上浮 / 发光 / 无），存 localStorage
   4) 雨效开关 + 鼠标悬停效果开关：均注入面板自带「个性化设置」对话框
   5) 数据恢复（服务器已有备份直接恢复）：注入「迁移」弹窗，绕开上传
   6) 时钟霓虹双线效果（透明填充 + 描边双线管壁 + 粉色辉光）
   7) 品牌换装：残留的旧品牌名统一成 crabapple-panel，首页大字保持纯文字
   说明：纯客户端，不依赖面板后端；天气/经纬度走公网免费 API（无密钥）。
   ========================================================= */
(function () {
  "use strict";
  if (window.__spFeaturesReady) return;
  window.__spFeaturesReady = true;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var LS = window.localStorage;

  /* 调试 / 验证用对外对象 */
  var DBG = window.__spFeat = {
    dayNight: "", rainMode: "auto", raining: false, rainDrops: 0,
    hover: ""
  };

  /* =========================================================
     1) 白昼 / 夜间 背景遮罩
     ========================================================= */
  var dnMask = document.createElement("div");
  dnMask.className = "sp-dn-mask";
  document.body.appendChild(dnMask);

  function applyDayNight() {
    var h = new Date().getHours();
    var isDay = h >= 6 && h < 18;
    dnMask.className = "sp-dn-mask " + (isDay ? "sp-dn-day" : "sp-dn-night");
    DBG.dayNight = isDay ? "day" : "night";
  }
  applyDayNight();
  setInterval(applyDayNight, 60 * 1000);

  /* =========================================================
     2) 雨天 Canvas 雨效
     ========================================================= */
  var rainCanvas = document.createElement("canvas");
  rainCanvas.className = "sp-rain";
  document.body.appendChild(rainCanvas);
  var rctx = rainCanvas.getContext("2d");
  var drops = [];
  var rainRAF = null;
  var rainAuto = false;          // 天气 API 判定的「当前是否下雨」
  var rainMode = LS.getItem("sp_rain_mode") || "auto"; // auto | on | off
  DBG.rainMode = rainMode;

  function sizeRain() {
    rainCanvas.width = window.innerWidth;
    rainCanvas.height = window.innerHeight;
    var n = Math.round(window.innerWidth / 7);
    drops = [];
    for (var i = 0; i < n; i++) {
      drops.push({
        x: Math.random() * rainCanvas.width,
        y: Math.random() * rainCanvas.height,
        len: 12 + Math.random() * 18,
        sp: 6 + Math.random() * 8,
        o: 0.25 + Math.random() * 0.5
      });
    }
    DBG.rainDrops = drops.length;
  }
  sizeRain();
  window.addEventListener("resize", sizeRain);

  function drawRain() {
    rctx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
    rctx.lineWidth = 1.2;
    rctx.lineCap = "round";
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      rctx.strokeStyle = "rgba(174,194,224," + d.o + ")";
      rctx.beginPath();
      rctx.moveTo(d.x, d.y);
      rctx.lineTo(d.x - 2, d.y + d.len);
      rctx.stroke();
      d.y += d.sp;
      d.x -= 0.6;
      if (d.y > rainCanvas.height) {
        d.y = -d.len;
        d.x = Math.random() * rainCanvas.width;
      }
    }
    rainRAF = requestAnimationFrame(drawRain);
  }

  function startRain() {
    if (rainRAF) return;
    drawRain();
  }
  function stopRain() {
    if (rainRAF) { cancelAnimationFrame(rainRAF); rainRAF = null; }
    rctx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
  }

  function applyRain() {
    var on = rainMode === "on" || (rainMode === "auto" && rainAuto);
    DBG.raining = on;
    rainCanvas.classList.toggle("sp-on", on);
    if (on) startRain(); else stopRain();
  }
  applyRain();

  function setRain(v) {
    rainMode = v;
    LS.setItem("sp_rain_mode", v);
    DBG.rainMode = v;
    applyRain();
    paintRainSeg();
  }

  function fetchWeather() {
    // 经纬度：优先浏览器定位（无提示失败则 IP 定位），再查 Open-Meteo 当前天气
    var gotGeo = function (lat, lon) {
      fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat +
            "&longitude=" + lon +
            "&current=precipitation,weather_code,rain,showers", { mode: "cors" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var c = d && d.current ? d.current : {};
          var wc = c.weather_code || 0;
          var pr = (c.precipitation || 0) + (c.rain || 0) + (c.showers || 0);
          var rainyCode = (wc >= 51 && wc <= 67) || (wc >= 80 && wc <= 82) || (wc >= 95 && wc <= 99);
          rainAuto = pr > 0.1 || rainyCode;
          applyRain();
        })
        .catch(function () { /* 保留当前状态 */ });
    };
    if (navigator.geolocation && navigator.geolocation.getCurrentPosition) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        gotGeo(pos.coords.latitude, pos.coords.longitude);
      }, function () {
        ipGeo(gotGeo);
      }, { timeout: 4000, maximumAge: 600000 });
    } else {
      ipGeo(gotGeo);
    }
  }
  function ipGeo(cb) {
    // 优先用 CORS 友好的 ipwho.is（免费、无需密钥）；失败再试 ipapi.co
    fetch("https://ipwho.is/json/", { mode: "cors" })
      .then(function (r) { return r.json(); })
      .then(function (g) {
        if (g && typeof g.latitude === "number" && typeof g.longitude === "number") {
          cb(g.latitude, g.longitude);
        } else {
          return fetch("https://ipapi.co/json/", { mode: "cors" })
            .then(function (r2) { return r2.json(); })
            .then(function (g2) {
              if (typeof g2.latitude === "number" && typeof g2.longitude === "number") cb(g2.latitude, g2.longitude);
            });
        }
      })
      .catch(function () {
        fetch("https://ipapi.co/json/", { mode: "cors" })
          .then(function (r) { return r.json(); })
          .then(function (g) {
            if (typeof g.latitude === "number" && typeof g.longitude === "number") cb(g.latitude, g.longitude);
          })
          .catch(function () { /* 无网络/限流：保留当前状态 */ });
      });
  }
  // 启动时拉一次天气；之后每 20 分钟刷新
  fetchWeather();
  setInterval(fetchWeather, 20 * 60 * 1000);

  /* =========================================================
     3) 卡片悬停效果
     ========================================================= */
  var hoverMode = LS.getItem("sp_hover_effect") || "scale"; // scale | float | glow | none
  DBG.hover = hoverMode;
  function applyHover() {
    document.body.classList.remove("sp-hov-scale", "sp-hov-float", "sp-hov-glow", "sp-hov-none");
    document.body.classList.add("sp-hov-" + hoverMode);
  }
  applyHover();

  function setHover(v) {
    hoverMode = v;
    LS.setItem("sp_hover_effect", v);
    DBG.hover = v;
    applyHover();
    paintHoverSeg();
  }

  function paintSeg(seg, val) {
    if (!seg) return;
    $$("button", seg).forEach(function (b) {
      b.classList.toggle("sp-on", b.getAttribute("data-v") === val);
    });
  }

  /* =========================================================
     4) 数据恢复：从服务器已有备份直接恢复（绕开浏览器上传）
        注入「迁移」弹窗（标题「系统应用 / 迁移」），列出 runtime/backup/*.zip，
        选一个 → 走原生 /recovery 接口。弹窗是 Vue 渲染，每次打开重建，故
        MutationObserver + 轮询双保险。
     ========================================================= */
  function getSpToken() {
    return LS.getItem("AUTH_TOKEN") || "";
  }
  function spApi(path, opts) {
    var tk = getSpToken();
    var headers = { "Content-Type": "application/json" };
    if (tk) { headers["x-sp-token"] = tk; headers["token"] = tk; }
    var o = opts || {};
    o.headers = headers;
    return fetch(path, o);
  }
  function fmtSize(n) {
    if (n > 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n > 1024) return (n / 1024).toFixed(1) + " KB";
    return n + " B";
  }
  function fmtTime(t) {
    var d = new Date(t * 1000);
    var p = function (x) { return (x < 10 ? "0" : "") + x; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  var restoreListEl = null;
  function dlUrl(name) {
    // 下载走浏览器原生 <a>，无法自定义请求头，故把 token 放进查询串
    return "/api/panel/backup/downloadBackupZIPFile?fileName=" + encodeURIComponent(name) +
      "&token=" + encodeURIComponent(getSpToken() || "");
  }
  function renderRestore(list) {
    var box = restoreListEl;
    if (!box) box = document.querySelector("[data-sp-restore-list]");
    if (!box) return;
    restoreListEl = box;
    box.innerHTML = "";
    if (!list || !list.length) {
      box.innerHTML = '<div class="sp-empty">服务器上暂无备份文件</div>';
      return;
    }
    list.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "sp-restore-item";
      var nm = String(it.name);
      row.innerHTML =
        '<div class="sp-ri-info"><div class="sp-ri-name" title="' + nm + '">' + nm + '</div>' +
        '<div class="sp-ri-meta">' + fmtSize(it.size) + ' · ' + fmtTime(it.mtime) + '</div></div>' +
        '<div class="sp-ri-acts">' +
          '<a class="sp-ri-btn sp-ghost" data-dl="1" href="' + dlUrl(nm) + '" download="' + nm + '"' +
            ' title="下载到本机">下载</a>' +
          '<button class="sp-ri-btn sp-del" data-del="' + nm + '" title="从服务器删除这份备份">删除</button>' +
          '<button class="sp-ri-btn" data-name="' + nm + '">恢复</button>' +
        '</div>';
      box.appendChild(row);
    });
  }
  function listExisting() {
    var box = restoreListEl || document.querySelector("[data-sp-restore-list]");
    if (box) { restoreListEl = box; box.innerHTML = '<div class="sp-empty">加载中…</div>'; }
    spApi("/api/panel/backup/listExisting")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.code === 0) renderRestore(d.data || []);
        else renderRestore([]);
      })
      .catch(function () { if (box) box.innerHTML = '<div class="sp-empty">获取失败，点「刷新备份列表」重试</div>'; });
  }
  function doRestore(name, btn) {
    btn.disabled = true;
    btn.textContent = "恢复中…";
    spApi("/api/panel/backup/recovery", {
      method: "POST",
      body: JSON.stringify({ fileName: name })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.code === 0) {
          btn.textContent = "已恢复 ✓";
          setTimeout(listExisting, 900);
        } else {
          btn.textContent = "恢复";
          btn.disabled = false;
          alert("恢复失败：" + ((d && d.msg) || "未知错误"));
        }
      })
      .catch(function (e) {
        btn.textContent = "恢复";
        btn.disabled = false;
        alert("恢复失败：" + (e && e.message ? e.message : e));
      });
  }

  function buildRestoreCard() {
    var card = document.createElement("div");
    card.className = "n-card n-card--embedded n-card--bordered";
    card.setAttribute("data-sp-restore-card", "1");
    card.style.borderRadius = "10px";
    card.innerHTML =
      '<div class="n-card-header" role="heading"><div class="n-card-header__main" role="heading">' +
        '<div class="text-slate-500 font-bold flex"><span>数据恢复（服务器已有备份）</span></div>' +
      '</div></div>' +
      '<div style="padding:12px 16px">' +
        '<div class="sp-note" style="margin-bottom:8px">下列备份已存在服务器上，点「恢复」直接还原，无需重新上传；「下载」存到本机，「删除」清掉服务器上的这份文件。</div>' +
        '<div class="sp-restore-list" data-sp-restore-list></div>' +
        '<button class="sp-wide" data-sp-refresh-backup style="margin-top:8px">刷新备份列表</button>' +
      '</div>';
    return card;
  }

  function getMigrateBody() {
    // 「迁移」弹窗主体：含「备份」「恢复」两个 n-card 的 flex-col 容器
    var b = $$(".n-card").filter(function (c) { return (c.innerText || "").trim() === "备份"; })[0];
    var r = $$(".n-card").filter(function (c) { return (c.innerText || "").trim() === "恢复"; })[0];
    if (!b || !r) return null;
    var p = b.parentElement;
    if (p && p.contains(r) && /flex-col/.test(p.className || "")) return p;
    // 兜底：向上找同时含两卡且为 flex-col 的祖先
    var n = b.parentElement;
    while (n && !(n.contains(r) && /flex-col/.test(n.className || ""))) n = n.parentElement;
    return n;
  }

  function doDelete(name, btn) {
    btn.disabled = true;
    btn.textContent = "删除中…";
    spApi("/api/panel/backup/delete", {
      method: "POST",
      body: JSON.stringify({ fileName: name })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.code === 0) { listExisting(); return; }
        btn.disabled = false;
        btn.textContent = "删除";
        alert("删除失败：" + ((d && d.msg) || "未知错误"));
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.textContent = "删除";
        alert("删除失败：" + (e && e.message ? e.message : e));
      });
  }

  // 两阶段确认：第一次点变成「确认…？」，3 秒内再点才真正执行，避免误触
  function twoPhase(btn, label, ask, run) {
    if (btn.getAttribute("data-confirm") === "1") {
      btn.removeAttribute("data-confirm");
      btn.classList.remove("sp-danger");
      btn.textContent = label;
      run();
      return;
    }
    btn.setAttribute("data-confirm", "1");
    btn.textContent = ask;
    btn.classList.add("sp-danger");
    setTimeout(function () {
      if (btn.getAttribute("data-confirm") !== "1") return;
      btn.removeAttribute("data-confirm");
      btn.textContent = label;
      btn.classList.remove("sp-danger");
    }, 3000);
  }

  function bindRestoreCard(card) {
    var list = card.querySelector("[data-sp-restore-list]");
    list.addEventListener("click", function (e) {
      // 下载是原生 <a>，不拦（拦了反而丢掉浏览器的断点续传与进度）
      if (e.target.closest("[data-dl]")) return;
      var del = e.target.closest("[data-del]");
      if (del) {
        twoPhase(del, "删除", "确认删除？", function () {
          doDelete(del.getAttribute("data-del"), del);
        });
        return;
      }
      var btn = e.target.closest("[data-name]");
      if (!btn) return;
      twoPhase(btn, "恢复", "确认恢复？", function () {
        doRestore(btn.getAttribute("data-name"), btn);
      });
    });
    card.querySelector("[data-sp-refresh-backup]").addEventListener("click", listExisting);
  }

  function injectRestoreIntoMigrate() {
    var body = getMigrateBody();
    if (!body) return;
    if (body.querySelector("[data-sp-restore-card]")) return; // 已注入
    var card = buildRestoreCard();
    body.appendChild(card);
    restoreListEl = card.querySelector("[data-sp-restore-list]");
    bindRestoreCard(card);
    listExisting();
  }

  /* =========================================================
     5) 雨效开关 + 鼠标悬停效果开关 → 注入「个性化设置」对话框
        原生对话框为 Vue 渲染，每次打开都会重建，故用 MutationObserver
        + 轮询兜底，确保两张卡片稳定出现；状态写入各自 localStorage 键。
     ========================================================= */
  function getSettingsContainer() {
    // 已知设置卡片的标题：时钟组件 / LOGO / 目录组件 等
    var cards = $$(".n-card").filter(function (c) { return c.querySelector(".n-card-header"); });
    var known = cards.find(function (c) {
      var t = ((c.querySelector(".n-card-header__main") || {}).textContent) || "";
      return /时钟组件|LOGO|目录组件/.test(t);
    });
    if (!known) return null;
    var cont = known.parentElement; // 承载所有设置卡片的滚动容器
    if (cont && cont.querySelectorAll(".n-card").length >= 2) return cont;
    return null;
  }

  function buildHoverCard() {
    var card = document.createElement("div");
    card.className = "n-card n-card--bordered";
    card.setAttribute("data-sp-hover-card", "1");
    card.style.borderRadius = "10px";
    card.innerHTML =
      '<div class="n-card-header" role="heading"><div class="n-card-header__main" role="heading">' +
        '<div class="text-slate-500 font-bold flex"><span>鼠标悬停效果</span></div>' +
      '</div></div>' +
      '<div style="padding:12px 16px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
          '<span style="color:#888;font-size:14px">卡片悬停时的动效</span>' +
          '<div class="sp-seg" data-sp-hover-seg style="flex:0 0 auto">' +
            '<button data-v="scale">缩放</button>' +
            '<button data-v="float">上浮</button>' +
            '<button data-v="glow">发光</button>' +
            '<button data-v="none">无</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    return card;
  }

  function buildRainCard() {
    var card = document.createElement("div");
    card.className = "n-card n-card--bordered";
    card.setAttribute("data-sp-rain-card", "1");
    card.style.borderRadius = "10px";
    card.innerHTML =
      '<div class="n-card-header" role="heading"><div class="n-card-header__main" role="heading">' +
        '<div class="text-slate-500 font-bold flex"><span>雨效</span></div>' +
      '</div></div>' +
      '<div style="padding:12px 16px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
          '<span style="color:#888;font-size:14px">背景雨效（自动按当地天气开启）</span>' +
          '<div class="sp-seg" data-sp-rain-seg style="flex:0 0 auto">' +
            '<button data-v="auto">自动</button>' +
            '<button data-v="on">开</button>' +
            '<button data-v="off">关</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    return card;
  }

  function paintHoverSeg() {
    paintSeg($("[data-sp-hover-seg]"), hoverMode);
  }
  function paintRainSeg() {
    paintSeg($("[data-sp-rain-seg]"), rainMode);
  }

  function injectSettingsCards() {
    var cont = getSettingsContainer();
    if (!cont) return;
    // 鼠标悬停效果卡片
    if (!cont.querySelector("[data-sp-hover-card]")) {
      var hc = buildHoverCard();
      cont.insertBefore(hc, cont.firstChild);
      hc.querySelector("[data-sp-hover-seg]").addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        setHover(b.getAttribute("data-v"));
      });
    }
    paintHoverSeg();
    // 雨效卡片（置于悬停卡片之后）
    if (!cont.querySelector("[data-sp-rain-card]")) {
      var rc = buildRainCard();
      var hc2 = cont.querySelector("[data-sp-hover-card]");
      if (hc2 && hc2.nextSibling) cont.insertBefore(rc, hc2.nextSibling);
      else cont.insertBefore(rc, cont.firstChild);
      rc.querySelector("[data-sp-rain-seg]").addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        setRain(b.getAttribute("data-v"));
      });
    }
    paintRainSeg();
  }

  // 对话框 / 弹窗每次打开由 Vue 重建，故 observe + 轮询双保险
  var _ivTimer = null;
  function scheduleInject() {
    if (_ivTimer) return;
    _ivTimer = setTimeout(function () { _ivTimer = null; injectSettingsCards(); injectRestoreIntoMigrate(); }, 300);
  }
  if (window.MutationObserver) {
    new MutationObserver(scheduleInject).observe(document.body, { childList: true, subtree: true });
  }
  injectSettingsCards();
  injectRestoreIntoMigrate();
  setInterval(function () { injectSettingsCards(); injectRestoreIntoMigrate(); }, 2000);

  /* =========================================================
     6) 时钟霓虹双线
     ========================================================= */
  /* 时钟霓虹双线：给时间数字打 class，并同步文本供 ::before 内描线 */
  function initClockNeon() {
    var ct = $(".clock-time");
    if (!ct || ct.classList.contains("sp-clock-neon")) return;
    ct.classList.add("sp-clock-neon");
    var sync = function () { ct.setAttribute("data-spclock", ct.textContent); };
    sync();
    if (window.MutationObserver) {
      new MutationObserver(sync).observe(ct, { childList: true, characterData: true, subtree: true });
    } else {
      setInterval(sync, 1000);
    }
  }
  initClockNeon();
  // 时钟容器可能是异步渲染的，兜底再探一次
  setTimeout(initClockNeon, 800);
  setInterval(function () {
    if (!$(".clock-time.sp-clock-neon")) initClockNeon();
  }, 5000);

  /* =========================================================
     7) 品牌：文字统一 Crabapple-Panel + 首页海棠 logo
     后端二进制 / 数据库里还有少量旧品牌名（页脚、备份文件名、控制台提示），
     字面长度不同不能二进制改，这里在 DOM 层兜底一次。
     ========================================================= */
  /* 旧品牌名拆开拼，避免被 _rebrand.py 的批量替换误伤 */
  var BRAND_OLD = "Sun" + "-" + "Panel";
  var BRAND_RE = new RegExp(BRAND_OLD, "g");
  var BRAND_TO = "Crabapple-Panel";
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };

  function rebrandNode(node) {
    var p = node.parentNode;
    if (!p || SKIP_TAGS[p.nodeName]) return;
    var v = node.nodeValue;
    if (!v || v.indexOf(BRAND_OLD) < 0) return;
    node.nodeValue = v.replace(BRAND_RE, BRAND_TO);
  }

  function rebrandTree(root) {
    if (!root) return;
    if (root.nodeType === 3) { rebrandNode(root); return; }
    if (root.nodeType !== 1 || SKIP_TAGS[root.nodeName]) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n, hit = 0;
    while ((n = w.nextNode())) {
      if (n.nodeValue && n.nodeValue.indexOf(BRAND_OLD) >= 0) { rebrandNode(n); hit++; }
    }
    return hit;
  }

  /* 首页大字（.logo）保持纯文字，不插图标——按用户要求，那个位置正常不显示 logo。
     万一历史版本注入过，这里顺手清掉。 */
  function clearBrandLogo() {
    var host = $(".logo");
    if (!host) return;
    var old = host.querySelector(".crab-brandlogo");
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  /* 登录页 / 404 页没有 .logo 容器，给标题上方补一个海棠标 */
  function ensureLoginLogo() {
    var title = document.querySelector(".login-title");
    if (!title || title.parentNode.querySelector(".crab-loginlogo")) return;
    var img = document.createElement("img");
    img.className = "crab-loginlogo";
    img.src = "/logo.png";
    img.alt = "";
    title.parentNode.insertBefore(img, title);
  }

  function brandPass() {
    rebrandTree(document.body);
    clearBrandLogo();
    ensureLoginLogo();
  }
  brandPass();
  if (window.MutationObserver) {
    var brandTimer = null;
    new MutationObserver(function (recs) {
      var has = false;
      for (var i = 0; i < recs.length; i++) {
        if (recs[i].type === "childList" && recs[i].addedNodes.length) { has = true; break; }
      }
      if (!has || brandTimer) return;
      brandTimer = setTimeout(function () { brandTimer = null; brandPass(); }, 200);
    }).observe(document.body, { childList: true, subtree: true });
  }
  setInterval(brandPass, 3000);

})();
