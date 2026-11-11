/* =========================================================
   本地授权中心  web/custom/auth-center.js
   ---------------------------------------------------------
   把「系统应用 → 授权管理」这个页面替换成自建的授权面板：
     · 一键开通（1 年 / 3 年 / 永久），即时生效
     · 生成 / 复制授权码，可在其它实例或重装后恢复
     · 续期、注销
   数据存在服务端 runtime/local_license.json，纯离线，不联网校验。
   开通后由前端层把 /api/panel/proAuth/getStatus 改写为已授权，
   于是 Sun-Panel 的 PRO 限制（账号数量、公共图库、自定义 JS/CSS、
   搜索引擎数量、微应用安装上限等）全部解锁。
   ========================================================= */
(function () {
  "use strict";
  if (window.__spAuthCenterReady) return;
  window.__spAuthCenterReady = true;

  var API = "/api/localAuth";
  /* 云端授权中心（Cloudflare Worker）：签发 / 续期 / 注销都在那边做，
     本机只拿它的 /api/verify 做一次"有没有登记"的对账。
     连不上也完全不影响使用 —— 本机校验始终是离线的。 */
  var CLOUD = "https://auth.xuers.dpdns.org";
  var STATE = null;
  var hiddenEls = [];
  var panel = null;
  var busy = false;

  /* ---------------- 样式 ---------------- */
  function injectStyle() {
    if (document.getElementById("sp-auth-style")) return;
    var css = "\
.la-wrap{--la-primary:#18a058;--la-primary-dark:#0f7a41;--la-line:#e6e8eb;--la-muted:#8a919a;\
  position:relative;box-sizing:border-box;width:100%;height:100%;padding:18px 20px 14px;\
  display:flex;flex-direction:column;gap:14px;overflow:auto;color:#2c3038;\
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}\
.la-wrap *{box-sizing:border-box;}\
.la-hero{position:relative;display:flex;align-items:center;gap:16px;padding:18px 20px;border-radius:10px;\
  background:linear-gradient(120deg,#0f172a 0%,#1f2a44 55%,#173b2c 100%);color:#fff;overflow:hidden;flex:0 0 auto;}\
.la-hero:after{content:'';position:absolute;right:-60px;top:-70px;width:220px;height:220px;border-radius:50%;\
  background:radial-gradient(circle,rgba(24,160,88,.55),rgba(24,160,88,0) 65%);}\
.la-hero-l{flex:1;min-width:0;z-index:1;}\
.la-hero-l h2{margin:0 0 4px;font-size:19px;font-weight:600;letter-spacing:.2px;}\
.la-hero-l p{margin:0;font-size:12px;color:#b7c2d4;}\
.la-tag{display:inline-block;margin-bottom:8px;padding:1px 8px;border-radius:999px;font-size:11px;\
  letter-spacing:.5px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.18);}\
.la-status{z-index:1;text-align:right;flex:0 0 auto;}\
.la-status b{display:block;font-size:15px;font-weight:600;}\
.la-status b.on{color:#5fe0a1;}\
.la-status b.off{color:#ffb4a8;}\
.la-status span{display:block;margin-top:4px;font-size:11px;color:#b7c2d4;}\
.la-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:14px;flex:0 0 auto;}\
.la-card{border:1px solid var(--la-line);border-radius:10px;background:#fff;padding:14px 16px;}\
.la-card-title{display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:13px;font-weight:600;color:#1f2937;}\
.la-card-title:before{content:'';width:3px;height:13px;border-radius:2px;background:var(--la-primary);}\
.la-plans{display:flex;gap:8px;margin-bottom:12px;}\
.la-plan{flex:1;padding:9px 8px;border-radius:8px;border:1px solid var(--la-line);background:#fafbfc;\
  cursor:pointer;text-align:center;transition:.15s;font-size:12px;color:#616a75;line-height:1.5;}\
.la-plan b{display:block;font-size:13px;color:#2c3038;margin-bottom:2px;}\
.la-plan:hover{border-color:#b9dfc9;}\
.la-plan.sel{border-color:var(--la-primary);background:#f0faf4;box-shadow:0 0 0 2px rgba(24,160,88,.12);}\
.la-plan.sel b{color:var(--la-primary-dark);}\
.la-btn{appearance:none;border:1px solid var(--la-line);background:#fff;color:#3d4450;border-radius:7px;\
  padding:7px 14px;font-size:13px;cursor:pointer;transition:.15s;line-height:1.2;}\
.la-btn:hover{border-color:#b9dfc9;color:var(--la-primary-dark);}\
.la-btn[disabled]{opacity:.5;cursor:not-allowed;}\
.la-primary{width:100%;border-color:var(--la-primary);background:var(--la-primary);color:#fff;font-weight:600;padding:9px 14px;}\
.la-primary:hover{background:var(--la-primary-dark);border-color:var(--la-primary-dark);color:#fff;}\
.la-feat{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr;gap:6px;}\
.la-feat li{display:flex;align-items:flex-start;gap:7px;font-size:12px;color:#5b6470;line-height:1.55;}\
.la-feat i{flex:0 0 auto;width:14px;height:14px;margin-top:2px;border-radius:50%;background:#eaf7ef;color:var(--la-primary-dark);\
  font-style:normal;font-size:10px;line-height:14px;text-align:center;}\
.la-code-row{display:flex;gap:8px;align-items:center;}\
.la-code-row code{flex:1;min-width:0;padding:8px 10px;border-radius:7px;background:#f6f8fa;border:1px dashed #d8dde3;\
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;color:#2c3038;\
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.3px;}\
.la-code-input{display:flex;gap:8px;margin-top:9px;}\
.la-code-input input{flex:1;min-width:0;padding:7px 10px;border:1px solid var(--la-line);border-radius:7px;\
  font-size:12.5px;color:#2c3038;outline:none;font-family:ui-monospace,Menlo,Consolas,monospace;}\
.la-code-input input:focus{border-color:var(--la-primary);box-shadow:0 0 0 2px rgba(24,160,88,.12);}\
.la-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:0 0 auto;padding-top:2px;margin-top:auto;}\
.la-foot a.la-btn{text-decoration:none;display:inline-flex;align-items:center;gap:4px;}\
.la-cloud{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11.5px;color:#98a0aa;}\
.la-card-title .la-cloud{margin:0 0 0 auto;font-size:11px;font-weight:400;}\
.la-cloud .dot{width:6px;height:6px;border-radius:50%;background:#c9ced6;flex:0 0 auto;}\
.la-cloud.ok .dot{background:#18a058;}\
.la-cloud.ok{color:#0f7a41;}\
.la-cloud.warn .dot{background:#e6a23c;}\
.la-cloud.bad .dot{background:#e03e2d;}\
.la-cloud a{color:#18a058;text-decoration:none;margin-left:auto;}\
.la-cloud a:hover{text-decoration:underline;}\
html.dark .la-cloud.ok{color:#5fe0a1;}\
html.dark .la-cloud a{color:#5fe0a1;}\
.la-meta{margin-top:9px;font-size:11px;color:#98a0aa;line-height:1.5;}\
.la-foot .la-tip{margin-left:auto;font-size:11px;color:var(--la-muted);}\
.la-toast{position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:99999;padding:9px 16px;border-radius:8px;\
  background:#2c3038;color:#fff;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,.18);opacity:0;transition:.25s;pointer-events:none;}\
.la-toast.show{opacity:1;}\
html.dark .la-card{background:#1e1e20;border-color:#2f3033;}\
html.dark .la-wrap{color:#e5e7eb;}\
html.dark .la-card-title{color:#e5e7eb;}\
html.dark .la-plan{background:#252528;border-color:#33343a;color:#a5abb6;}\
html.dark .la-plan b{color:#e5e7eb;}\
html.dark .la-plan.sel{background:#12291c;border-color:var(--la-primary);}\
html.dark .la-btn{background:#252528;border-color:#33343a;color:#d6d9de;}\
html.dark .la-code-row code{background:#252528;border-color:#33343a;color:#e5e7eb;}\
html.dark .la-code-input input{background:#252528;border-color:#33343a;color:#e5e7eb;}\
@media (max-width:820px){.la-grid{grid-template-columns:1fr;}}\
";
    var el = document.createElement("style");
    el.id = "sp-auth-style";
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------------- 工具 ---------------- */
  function toast(msg) {
    var el = document.querySelector(".la-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "la-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el.__t);
    el.__t = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  function getToken() {
    /* Sun-Panel 把登录态序列化在 localStorage 的 AUTH_TOKEN 里：
       {"data":{"token":"..."}} */
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

  function post(path, body) {
    var headers = { "Content-Type": "application/json" };
    var tok = getToken();
    if (tok) headers["x-sp-token"] = tok;
    return fetch(API + path, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json(); });
  }

  function fmtDate(ts) {
    if (!ts) return "永久有效";
    var d = new Date(ts * 1000);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------------- 云端对账 ---------------- */
  function setCloud(kind, text) {
    if (!panel) return;
    var box = panel.querySelector("#la-cloud");
    var txt = panel.querySelector("#la-cloud-txt");
    if (!box || !txt) return;
    box.className = "la-cloud " + (kind === "ok" || kind === "warn" || kind === "bad" ? kind : "");
    txt.textContent = text;
  }

  function checkCloud(code) {
    if (!code || code === "—") { setCloud("", "云端状态：本机未开通"); return; }
    if (!window.fetch || !window.AbortController) { setCloud("", "云端状态：当前浏览器不支持"); return; }
    setCloud("", "云端状态：检测中…");
    var ctl = new AbortController();
    var timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 6000);
    fetch(CLOUD + "/api/verify?code=" + encodeURIComponent(code), {
      signal: ctl.signal, cache: "no-store", credentials: "omit"
    }).then(function (r) { return r.json(); }).then(function (res) {
      clearTimeout(timer);
      var d = (res && res.data) || {};
      if (!res || !res.ok) { setCloud("bad", "云端状态：查询失败"); return; }
      if (d.revoked) setCloud("warn", "云端 · 已注销（本机仍生效）");
      else if (!d.valid) setCloud("warn", "云端 · 未登记（本机自签）");
      else if (d.expired) setCloud("warn", "云端 · 已过期");
      else setCloud("ok", "云端 · 已登记" + (d.exp ? "，到期 " + fmtDate(d.exp) : "，永久"));
    }).catch(function () {
      clearTimeout(timer);
      setCloud("", "云端 · 连接不上（离线照常可用）");
    });
  }

  /* ---------------- 面板 ---------------- */
  var FEATURES = [
    "解除微应用安装数量上限（默认 5 个）",
    "解除账号数量限制（默认 2 个）与账号切换数量",
    "开放公共图库、自定义 JS / CSS 注入",
    "解除搜索引擎自定义数量限制",
    "隐藏所有 PRO 徽章与升级提示",
    "本地离线授权，不联网、不上传任何数据"
  ];

  function buildPanel() {
    var wrap = document.createElement("div");
    wrap.className = "la-wrap";
    wrap.innerHTML = [
      '<div class="la-hero">',
      '  <div class="la-hero-l">',
      '    <span class="la-tag">LOCAL LICENSE</span>',
      '    <h2>本地授权中心</h2>',
      '    <p>离线授权 · 一键开通 · 全功能解锁</p>',
      '  </div>',
      '  <div class="la-status"><b id="la-state">读取中…</b><span id="la-expire"></span></div>',
      '</div>',
      '<div class="la-grid">',
      '  <div class="la-card">',
      '    <div class="la-card-title">开通 / 续期</div>',
      '    <div class="la-plans">',
      '      <div class="la-plan sel" data-days="365"><b>个人版</b>1 年</div>',
      '      <div class="la-plan" data-days="1095"><b>专业版</b>3 年</div>',
      '      <div class="la-plan" data-days="0"><b>永久</b>长期有效</div>',
      '    </div>',
      '    <button class="la-btn la-primary" id="la-activate">立即开通授权</button>',
      '  </div>',
      '  <div class="la-card">',
      '    <div class="la-card-title">授权后解锁</div>',
      '    <ul class="la-feat">',
      FEATURES.map(function (f) { return '<li><i>✓</i><span>' + esc(f) + "</span></li>"; }).join(""),
      '    </ul>',
      '  </div>',
      '</div>',
      '<div class="la-card">',
      '  <div class="la-card-title">授权码',
      '    <span class="la-cloud" id="la-cloud"><span class="dot"></span><span id="la-cloud-txt">云端状态：未检测</span></span>',
      '  </div>',
      '  <div class="la-code-row">',
      '    <code id="la-code">—</code>',
      '    <button class="la-btn" id="la-copy">复制</button>',
      '  </div>',
      '  <div class="la-code-input">',
      '    <input id="la-input" placeholder="已有授权码？粘贴到这里激活 / 迁移" spellcheck="false" autocomplete="off">',
      '    <button class="la-btn" id="la-apply">激活</button>',
      '  </div>',
      '  <div class="la-meta" id="la-meta"></div>',
      '</div>',
      '<div class="la-foot">',
      '  <button class="la-btn" id="la-renew">续期 1 年</button>',
      '  <button class="la-btn" id="la-revoke">注销授权</button>',
      '  <a class="la-btn" id="la-cloud-link" href="' + CLOUD + '" target="_blank" rel="noopener">云端授权中心</a>',
      '  <span class="la-tip">授权仅对本实例生效</span>',
      '</div>'
    ].join("");

    /* 事件 */
    var days = 365;
    wrap.querySelectorAll(".la-plan").forEach(function (b) {
      b.addEventListener("click", function () {
        wrap.querySelectorAll(".la-plan").forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel");
        days = parseInt(b.getAttribute("data-days"), 10);
        var btn = wrap.querySelector("#la-activate");
        btn.textContent = STATE && STATE.activated ? "延长有效期并应用" : (days === 0 ? "开通永久授权" : "立即开通授权");
      });
    });

    wrap.querySelector("#la-activate").addEventListener("click", function () {
      act({ days: days }, "开通成功");
    });
    wrap.querySelector("#la-renew").addEventListener("click", function () {
      act({ days: 365 }, "已续期 1 年");
    });
    wrap.querySelector("#la-revoke").addEventListener("click", function () {
      if (!confirm("确定注销本地授权？注销后 PRO 功能会立即失效。")) return;
      act({ revoke: true }, "已注销授权");
    });
    wrap.querySelector("#la-apply").addEventListener("click", function () {
      var code = (wrap.querySelector("#la-input").value || "").trim();
      if (!code) { toast("请先粘贴授权码"); return; }
      act({ code: code }, "授权码激活成功");
    });
    wrap.querySelector("#la-copy").addEventListener("click", function () {
      var code = wrap.querySelector("#la-code").textContent || "";
      if (!code || code === "—") { toast("开通后才会生成授权码"); return; }
      var done = function () { toast("授权码已复制"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(function () { fallbackCopy(code, done); });
      } else fallbackCopy(code, done);
    });
    return wrap;
  }

  function fallbackCopy(text, cb) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); cb(); } catch (e) { toast("复制失败，请手动选择"); }
    document.body.removeChild(ta);
  }

  function act(body, okMsg) {
    if (busy) return;
    busy = true;
    post("/activate", body).then(function (res) {
      busy = false;
      if (!res || res.code !== 0) {
        toast((res && res.msg) || "操作失败");
        return;
      }
      toast(okMsg + "，正在刷新…");
      setTimeout(function () { location.reload(); }, 800);
    }).catch(function () { busy = false; toast("网络错误，请重试"); });
  }

  function render(state) {
    STATE = state;
    if (!panel) return;
    var st = panel.querySelector("#la-state");
    var ex = panel.querySelector("#la-expire");
    var code = panel.querySelector("#la-code");
    var actBtn = panel.querySelector("#la-activate");
    var meta = panel.querySelector("#la-meta");
    var PLAN = { personal: "个人版", pro: "专业版", permanent: "永久版", code: "授权码", custom: "自定义" };
    if (state && state.activated) {
      st.textContent = "已授权";
      st.className = "on";
      ex.textContent = state.permanent ? "永久有效" : ("有效期至 " + fmtDate(state.expiresAt));
      code.textContent = state.code || "—";
      actBtn.textContent = "延长有效期并应用";
      if (meta) {
        meta.textContent = "授权类型 " + (PLAN[state.plan] || state.plan || "本机") +
          " · 本机设备 " + (state.device || "—") +
          (state.activatedAt ? (" · 开通于 " + fmtDate(state.activatedAt)) : "");
      }
    } else {
      st.textContent = "未授权";
      st.className = "off";
      ex.textContent = "开通后立即生效";
      code.textContent = "—";
      actBtn.textContent = "立即开通授权";
      if (meta) meta.textContent = "本机暂无授权记录 · 开通后可生成授权码用于迁移";
    }
    checkCloud(state && state.activated ? state.code : "");
  }

  /* ---------------- 挂载 / 卸载 ---------------- */
  function hostEl() {
    return document.querySelector(".app-starter-modal-content .n-layout-content .fade-in-animation");
  }

  function isAuthPage(host) {
    var txt = host.innerText || "";
    if (/快速登录 Sun-Panel 账号|账号密码登录|授权官网|Sun-Panel authorize/i.test(txt)) return true;
    return false;
  }

  function unmount() {
    if (!panel) return;
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    hiddenEls.forEach(function (el) { try { el.style.display = ""; } catch (e) {} });
    hiddenEls = [];
  }

  function mount(host) {
    injectStyle();
    if (panel && panel.parentNode === host) return;
    unmount();
    hiddenEls = Array.prototype.slice.call(host.children);
    hiddenEls.forEach(function (el) { el.style.display = "none"; });
    panel = buildPanel();
    host.appendChild(panel);
    post("/status", {}).then(function (res) {
      if (res && res.code === 0) render(res.data);
      else render(null);
    }).catch(function () { render(null); });
  }

  function tick() {
    var host = hostEl();
    if (!host) { unmount(); return; }
    if (panel && panel.parentNode === host) {
      /* 被隐藏的原内容还在，说明仍是授权页；若 Vue 已把页面换掉，就收摊 */
      var anchor = hiddenEls[0];
      var stillAuth = anchor && anchor.parentNode === host &&
        /快速登录 Sun-Panel 账号|账号密码登录|授权官网/.test(anchor.textContent || "");
      if (!stillAuth) unmount();
      return;
    }
    if (!isAuthPage(host)) { unmount(); return; }
    mount(host);
  }

  function boot() {
    injectStyle();
    setInterval(tick, 700);
    /* 打开弹窗后内容可能稍晚渲染，再补两次 */
    document.addEventListener("click", function () { setTimeout(tick, 350); setTimeout(tick, 900); }, true);
    tick();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
