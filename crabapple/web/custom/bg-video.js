/* =========================================================
   视频背景增强  web/custom/bg-video.js
   ---------------------------------------------------------
   目标：让「视频壁纸」在各类设备/浏览器上跑得更顺、更稳。

   做四件事：
   1) 流畅度
      - 把 <video> 提升为独立合成层（translateZ/will-change），避免 blur
        滤镜导致整页每帧重绘；
      - 弱设备自动降低壁纸模糊半径（GPU 最贵的一项）；
      - 限制同时解码的视频数量，页面隐藏/滚出视口时暂停。
   2) 首帧不黑屏
      - loadeddata 时用 canvas 抽一帧作为海报，先显示静帧再淡入视频；
      - autoplay 被拒（iOS 低电量、Safari 策略）时保留静帧并等待首次交互。
   3) 兼容性
      - 补齐 playsinline / webkit-playsinline / x5-playsinline 等属性，
        避免 iOS、微信 X5 内核把视频拉成全屏；
      - 编解码不支持（如 HEVC .mov）加载失败时优雅降级为纯色渐变背景。
   4) 省电
      - 尊重 prefers-reduced-motion，页面不可见时暂停播放。
   ========================================================= */
(function () {
  "use strict";
  if (window.__spBgVideoReady) return;
  window.__spBgVideoReady = true;

  var MAX_CONCURRENT = 2;          // 同时播放的视频上限
  var RETRY_TIMES = 3;
  var styleInjected = false;
  var playing = [];                // 当前正在播放的 video
  var posterDone = new WeakSet();

  /* ---------------- 设备能力 ---------------- */
  var cores = navigator.hardwareConcurrency || 4;
  var mem = navigator.deviceMemory || 4;
  var lowEnd = cores <= 4 || mem <= 3;
  var reduceMotion = false;
  try {
    reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  function injectStyle() {
    if (styleInjected || !document.head) return;
    styleInjected = true;
    var css = [
      /* 壁纸视频：独立合成层 + 不参与重排 */
      ".wallpaper-video{object-fit:cover!important;backface-visibility:hidden;transform:translateZ(0);" +
        "will-change:transform;contain:paint;background:#0b0b0f;}",
      /* 壁纸容器底色，避免加载时闪白/闪黑 */
      ".wallpaper-container{background:#0b0b0f;}",
      /* 静帧海报层 */
      ".sp-bg-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" +
        "pointer-events:none;z-index:1;}",
      ".wallpaper-video.sp-bg-fadein{opacity:0;transition:opacity .55s ease;}",
      ".wallpaper-video.sp-bg-shown{opacity:1;}",
      /* 加载失败时的渐变兜底 */
      ".wallpaper-container.sp-bg-degraded{background:linear-gradient(135deg,#141420 0%,#0b0b0f 55%,#1a1622 100%)!important;}",
      /* 缩略图视频：不占合成层，避免图库滚动卡顿 */
      ".img-card video{transform:none;will-change:auto;}"
    ].join("\n");
    var el = document.createElement("style");
    el.id = "sp-bg-video-style";
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------------- 属性补全 ---------------- */
  function harden(video) {
    if (video.__spBgHarden) return;
    video.__spBgHarden = true;

    var isWallpaper = video.classList.contains("wallpaper-video");
    video.muted = true;
    video.defaultMuted = true;
    if (!video.hasAttribute("playsinline")) video.setAttribute("playsinline", "");
    if (!video.hasAttribute("webkit-playsinline")) video.setAttribute("webkit-playsinline", "");
    if (!video.hasAttribute("x5-playsinline")) video.setAttribute("x5-playsinline", "");
    if (!video.hasAttribute("x5-video-player-type")) video.setAttribute("x5-video-player-type", "h5-page");
    video.disablePictureInPicture = true;              // 避免误触画中画
    try { video.disableRemotePlayback = true; } catch (e) {}
    video.setAttribute("preload", isWallpaper ? "auto" : "metadata");
    if (isWallpaper) video.setAttribute("loop", "");
    else video.pause();

    /* 弱设备：模糊是 GPU 大头，降一半 */
    if (isWallpaper && lowEnd) tuneBlur(video);

    video.addEventListener("error", function () { degrade(video); }, true);

    /* 首帧海报 + 首次播放尝试 */
    if (isWallpaper) {
      if (video.readyState >= 2) onReady(video);
      else video.addEventListener("loadeddata", function () { onReady(video); });
      tryPlay(video, 0);

      /* 播放态淡入 */
      video.addEventListener("playing", function () {
        trackPlaying(video);
        video.classList.remove("sp-bg-fadein");
        video.classList.add("sp-bg-shown");
      });
      video.addEventListener("pause", function () { untrack(video); });
      /* iOS 上 loop 回卷会闪黑，提前 0.2s 手动回卷更稳 */
      video.addEventListener("timeupdate", function () {
        if (!video.duration || !isFinite(video.duration)) return;
        if (video.duration - video.currentTime < 0.2) {
          try { video.currentTime = 0; } catch (e) {}
        }
      });
      video.addEventListener("stalled", function () { if (!video.paused) tryPlay(video, 1); });

      /* 卡顿检测：连续两次卡住超过 2.5s，就静态化，别让整页跟着卡 */
      var stallAt = 0, stalls = 0;
      /* 换壁纸（src 变了）时把静态化状态复位，否则新视频会一直 opacity:0 */
      video.addEventListener("loadstart", function () {
        video.__spStatic = false;
        video.style.opacity = "";
        video.__spPosterUrl = null;
        posterDone.delete(video);
        stallAt = 0;
        stalls = 0;
        var host = video.parentElement;
        var old = host && host.querySelector(".sp-bg-poster");
        if (old && old.parentNode) old.parentNode.removeChild(old);
      });
      video.addEventListener("waiting", function () {
        if (!stallAt) stallAt = Date.now();
      });
      video.addEventListener("timeupdate", function () {
        if (!video.paused) stallAt = 0;
      });
      video.addEventListener("playing", function () {
        if (stallAt && Date.now() - stallAt > 2500) {
          stalls++;
          if (stalls >= 2) posterOnly(video, "播放持续卡顿");
        }
        stallAt = 0;
      });

      observeVisibility(video);
    }
  }

  function tuneBlur(video) {
    var box = video.closest(".wallpaper-container") || video.parentElement;
    var LIMIT = 6;
    [video, box].forEach(function (el) {
      if (!el || !el.style || !el.style.filter) return;
      var m = el.style.filter.match(/blur\(([\d.]+)px\)/);
      if (m && parseFloat(m[1]) > LIMIT) {
        el.style.filter = el.style.filter.replace(/blur\([\d.]+px\)/, "blur(" + LIMIT + "px)");
      }
    });
  }

  function grabPoster(video) {
    try {
      var w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return null;
      var scale = Math.min(1, 720 / Math.max(w, h));
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
      var url = c.toDataURL("image/jpeg", 0.72);
      return url && url.length > 200 ? url : null;
    } catch (e) {
      /* 跨域视频会污染 canvas，取不到就算了 */
      return null;
    }
  }

  function insertPoster(video) {
    var url = video.__spPosterUrl || grabPoster(video);
    if (!url) return null;
    video.__spPosterUrl = url;
    var host = video.parentElement;
    if (!host) return null;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    var old = host.querySelector(".sp-bg-poster");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var img = document.createElement("img");
    img.className = "sp-bg-poster";
    img.alt = "";
    img.src = url;
    img.setAttribute("aria-hidden", "true");
    img.style.filter = video.style.filter || "";
    host.insertBefore(img, video);
    return img;
  }

  /* 弱设备 / 弱网 / 大分辨率视频：直接静态化，只留一张首帧。
     4K 壁纸在高码率下解码成本很高，静态化后 CPU/GPU 立刻安静下来。 */
  function shouldStatic(video) {
    if (reduceMotion) return "系统偏好减少动态效果";
    var net = navigator.connection || {};
    if (net.saveData === true) return "开启了省流量模式";
    if (/(^|-)2g$/.test(net.effectiveType || "")) return "网络为 2G";
    var cores = navigator.hardwareConcurrency || 4;
    var mem = navigator.deviceMemory || 4;
    var big = (video.videoWidth || 0) >= 2560 || (video.videoHeight || 0) >= 1440;
    if (big && (cores <= 4 || mem <= 3)) return "弱设备 + 高分视频";
    return "";
  }

  function posterOnly(video, reason) {
    if (video.__spStatic) return;
    video.__spStatic = true;
    insertPoster(video);
    try { video.pause(); } catch (e) {}
    video.style.opacity = "0";     // 保留元素，避免 Vue diff 出问题
    console.info("[bg-video] 壁纸已静态化（" + reason + "）");
  }

  function onReady(video) {
    if (posterDone.has(video)) return;
    posterDone.add(video);

    var why = shouldStatic(video);
    if (why) { posterOnly(video, why); return; }

    if (!video.paused && video.currentTime > 0.3) return;  // 已经在正常播放，不需要静帧
    var img = insertPoster(video);
    if (!img) return;
    /* 视频真正开始播放后移除静帧，省一层内存 */
    var drop = function () {
      setTimeout(function () { if (img.parentNode) img.parentNode.removeChild(img); }, 800);
    };
    if (!video.paused) drop();
    else video.addEventListener("playing", drop, { once: true });
    setTimeout(function () { if (img.parentNode) img.parentNode.removeChild(img); }, 60000);
  }

  /* ---------------- 播放控制 ---------------- */
  function tryPlay(video, attempt) {
    if (document.hidden || video.__spStatic) return;
    var p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        if (attempt < RETRY_TIMES) {
          setTimeout(function () { tryPlay(video, attempt + 1); }, 900 * (attempt + 1));
        } else {
          /* 仍失败：等用户第一次交互再试（iOS 低电量/省电策略） */
          var kick = function () {
            document.removeEventListener("pointerdown", kick, true);
            document.removeEventListener("touchstart", kick, true);
            document.removeEventListener("keydown", kick, true);
            tryPlay(video, RETRY_TIMES);
          };
          document.addEventListener("pointerdown", kick, true);
          document.addEventListener("touchstart", kick, true);
          document.addEventListener("keydown", kick, true);
        }
      });
    }
  }

  function trackPlaying(video) {
    if (playing.indexOf(video) === -1) playing.push(video);
    /* 超出并发上限时优先暂停非壁纸视频（缩略图），壁纸最后才让位 */
    while (playing.length > MAX_CONCURRENT) {
      var idx = -1;
      for (var i = 0; i < playing.length; i++) {
        if (playing[i] !== video && !playing[i].classList.contains("wallpaper-video")) { idx = i; break; }
      }
      if (idx === -1) idx = 0;
      var old = playing.splice(idx, 1)[0];
      if (old && old !== video && !old.paused) { try { old.pause(); } catch (e) {} }
    }
  }

  function untrack(video) {
    var i = playing.indexOf(video);
    if (i > -1) playing.splice(i, 1);
  }

  function observeVisibility(video) {
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          if (video.paused && !video.__spStatic) tryPlay(video, 1);
        } else if (!video.paused) {
          try { video.pause(); } catch (e) {}
        }
      });
    }, { threshold: 0.01 });
    io.observe(video);
  }

  function degrade(video) {
    var box = video.closest(".wallpaper-container") || video.parentElement;
    if (box) box.classList.add("sp-bg-degraded");
    video.style.display = "none";
    console.warn("[bg-video] 视频加载失败，已降级为静态背景:", video.currentSrc || video.src);
  }

  /* ---------------- 扫描 / 监听 ---------------- */
  function scan(root) {
    var list = (root || document).querySelectorAll("video");
    for (var i = 0; i < list.length; i++) harden(list[i]);
  }

  function boot() {
    injectStyle();
    scan(document);

    var mo = new MutationObserver(function (records) {
      var dirty = false;
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.addedNodes && r.addedNodes.length) {
          for (var j = 0; j < r.addedNodes.length; j++) {
            var n = r.addedNodes[j];
            if (n.nodeType === 1 && (n.tagName === "VIDEO" || (n.querySelector && n.querySelector("video")))) {
              dirty = true;
            }
          }
        }
      }
      if (dirty) scan(document);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    /* 页面隐藏时暂停，回来再播 —— 省电也省 GPU */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        playing.slice().forEach(function (v) { try { v.pause(); } catch (e) {} });
      } else {
        playing.slice().forEach(function (v) { tryPlay(v, 1); });
        scan(document);
      }
    });

    window.addEventListener("pagehide", function () {
      playing.slice().forEach(function (v) { try { v.pause(); } catch (e) {} });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
