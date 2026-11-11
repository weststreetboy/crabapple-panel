/* =========================================================
   自定义脚本  web/custom/index.js
   功能：Ctrl/⌘+K 快捷指令栏
         - 前缀指令：b 百度 / gh GitHub / bi 哔哩 / w 维基
         - 无前缀：默认百度搜索；以 http(s):// 开头则直接打开
         - ↑ ↓ 选择，Enter 打开，Esc 关闭
         - 不干扰 Vue 应用，纯浮层，独立 z-index
   想加快捷站点，改下面的 QUICK_LINKS 即可
   ========================================================= */
(function () {
  "use strict";
  if (window.__spPaletteReady) return;
  window.__spPaletteReady = true;

  /* ---------- 配置 ---------- */
  var QUICK_LINKS = [
    { icon: "🏠", title: "GitHub", url: "https://github.com" },
    { icon: "📺", title: "Bilibili", url: "https://www.bilibili.com" },
    { icon: "📚", title: "识字工作台", url: "https://literacy-workbench-07109.app.workbuddy.host" },
    { icon: "🖥️", title: "rdgen 面板", url: "https://rd.xuers.top:16888/" }
  ];

  var ENGINES = [
    { key: "b",  icon: "🔍", title: "百度搜索",   url: function (q) { return "https://www.baidu.com/s?wd=" + encodeURIComponent(q); } },
    { key: "gh", icon: "🐙", title: "GitHub 搜索", url: function (q) { return "https://github.com/search?q=" + encodeURIComponent(q); } },
    { key: "bi", icon: "📺", title: "哔哩搜索",   url: function (q) { return "https://search.bilibili.com/all?keyword=" + encodeURIComponent(q); } },
    { key: "w",  icon: "📖", title: "维基百科",   url: function (q) { return "https://zh.wikipedia.org/w/index.php?search=" + encodeURIComponent(q); } }
  ];
  var DEFAULT_ENGINE = "b";

  /* ---------- 运行时状态 ---------- */
  var mask = null, input = null, listEl = null, rows = [], cursor = 0;

  function open_(url) {
    if (!url) return;
    close();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function buildRows(q) {
    var out = [];
    var query = (q || "").trim();

    // 1) 引擎指令
    var m = /^(\S+)\s+(.+)$/.exec(query);
    if (m) {
      var hit = null;
      for (var i = 0; i < ENGINES.length; i++) {
        if (ENGINES[i].key === m[1]) { hit = ENGINES[i]; break; }
      }
      if (hit) {
        out.push({ icon: hit.icon, title: hit.title, hint: m[2], url: hit.url(m[2]) });
      }
    }

    // 2) 直接 URL
    if (/^https?:\/\//i.test(query)) {
      out.push({ icon: "🔗", title: "打开链接", hint: query, url: query });
    }

    // 3) 快捷站点（按标题/URL 过滤）
    var lq = query.toLowerCase();
    QUICK_LINKS.forEach(function (it) {
      if (!lq || it.title.toLowerCase().indexOf(lq) !== -1 || it.url.toLowerCase().indexOf(lq) !== -1) {
        out.push({ icon: it.icon, title: it.title, hint: it.url, url: it.url });
      }
    });

    // 4) 默认引擎搜索（有查询且没有命中指令时）
    if (query && !m) {
      out.push({
        icon: "🔍", title: "百度搜索", hint: query,
        url: ENGINES.filter(function (e) { return e.key === DEFAULT_ENGINE; })[0].url(query)
      });
    }
    return out;
  }

  function render(q) {
    rows = buildRows(q);
    cursor = 0;
    listEl.innerHTML = "";
    if (!rows.length) {
      var em = document.createElement("div");
      em.className = "sp-empty";
      em.textContent = "输入内容搜索，或直接输入网址";
      listEl.appendChild(em);
      return;
    }
    rows.forEach(function (r, idx) {
      var row = document.createElement("div");
      row.className = "sp-row" + (idx === 0 ? " sp-on" : "");
      row.setAttribute("data-idx", String(idx));

      var ico = document.createElement("span");
      ico.className = "sp-ico";
      ico.textContent = r.icon;

      var t = document.createElement("span");
      t.className = "sp-t";
      t.textContent = r.title;

      var h = document.createElement("span");
      h.className = "sp-h";
      h.textContent = r.hint || "";

      row.appendChild(ico);
      row.appendChild(t);
      row.appendChild(h);

      row.addEventListener("mousemove", function () { setCursor(idx); });
      row.addEventListener("click", function () { open_(r.url); });
      listEl.appendChild(row);
    });
  }

  function setCursor(idx) {
    if (!rows.length) return;
    cursor = (idx + rows.length) % rows.length;
    var nodes = listEl.querySelectorAll(".sp-row");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle("sp-on", i === cursor);
    }
  }

  function openPalette() {
    if (mask) return;
    mask = document.createElement("div");
    mask.className = "sp-mask";

    var panel = document.createElement("div");
    panel.className = "sp-panel";

    input = document.createElement("input");
    input.className = "sp-input";
    input.type = "text";
    input.placeholder = "搜索，或输入 b / gh / bi / w + 关键词…";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");

    listEl = document.createElement("div");
    listEl.className = "sp-list";

    var foot = document.createElement("div");
    foot.className = "sp-foot";
    foot.innerHTML = "<span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>" +
                     "<span><kbd>Enter</kbd> 打开</span>" +
                     "<span><kbd>Esc</kbd> 关闭</span>";

    panel.appendChild(input);
    panel.appendChild(listEl);
    panel.appendChild(foot);
    mask.appendChild(panel);
    document.body.appendChild(mask);

    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor(cursor + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(cursor - 1); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (rows[cursor]) open_(rows[cursor].url);
      } else if (e.key === "Escape") { e.preventDefault(); close(); }
      e.stopPropagation();
    });
    mask.addEventListener("mousedown", function (e) {
      if (e.target === mask) close();
    });

    render("");
    setTimeout(function () { input.focus(); }, 0);
  }

  function close() {
    if (!mask) return;
    mask.remove();
    mask = input = listEl = null;
    rows = [];
  }

  /* ---------- 快捷键 ---------- */
  document.addEventListener("keydown", function (e) {
    var k = e.key ? e.key.toLowerCase() : "";
    if ((e.ctrlKey || e.metaKey) && k === "k") {
      e.preventDefault();
      mask ? close() : openPalette();
      return;
    }
    if (k === "escape" && mask) { e.preventDefault(); close(); }
  }, true);

  /* 输入框里按 Ctrl+K 也不误触；单按 "/" 打开（非输入态） */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = document.activeElement;
    var tag = el && el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || (el && el.isContentEditable)) return;
    if (mask) return;
    e.preventDefault();
    openPalette();
  }, true);
})();

/* 卡片标题统一在 index.css 里隐藏；此处不再注入任何设置项。 */
