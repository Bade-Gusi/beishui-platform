/* ============================================================
   背水对战平台 · 非线性动效层
   零依赖；自动增强现有页面，不改变业务逻辑。
   ============================================================ */
(function (global, doc) {
  "use strict";

  var html = doc.documentElement;
  var body = doc.body;
  var reduce = global.matchMedia
    ? global.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
  var fine = global.matchMedia
    ? global.matchMedia("(hover: hover) and (pointer: fine)").matches
    : false;
  var mode = body ? (body.getAttribute("data-motion") || "full") : "full";
  var lite = mode === "lite";
  var ready = false;
  var cursorGlowReady = false;

  function all(selector, root) {
    return Array.prototype.slice.call((root || doc).querySelectorAll(selector));
  }

  function one(selector, root) {
    return (root || doc).querySelector(selector);
  }

  function hasPseudo(el, pseudo) {
    if (!el) return false;
    try {
      var content = global.getComputedStyle(el, pseudo).content;
      return !!content && content !== "none" && content !== "normal";
    } catch (e) {
      return false;
    }
  }

  function raf(fn) {
    return global.requestAnimationFrame(fn);
  }

  /* ---------------- 打字机 ---------------- */
  function typewrite(el, speed) {
    if (!el || reduce) return;
    var text = el.textContent;
    if (!text) return;
    el.textContent = "";
    el.classList.add("m-typing");
    var index = 0;

    function tick() {
      if (index >= text.length) {
        el.textContent = text;
        el.classList.remove("m-typing");
        return;
      }
      el.textContent += text.charAt(index++);
      global.setTimeout(tick, speed || 34);
    }

    global.setTimeout(tick, 120);
  }

  function setupTypewriter() {
    if (reduce || lite || doc.visibilityState === "hidden") return;

    var eyebrow = one(".page-head .eyebrow");
    if (eyebrow && !eyebrow.__mTyped) {
      eyebrow.__mTyped = true;
      typewrite(eyebrow, 26);
    }

    var en = one(".hero .en");
    if (en && !en.__mTyped) {
      en.__mTyped = true;
      typewrite(en, 24);
    }
  }

  /* ---------------- 数字滚动 ---------------- */
  function parseNumber(value) {
    if (value == null) return null;
    var match = String(value).replace(/,/g, "").match(/-?\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  function animateCounter(el, from, to, state) {
    if (reduce) {
      el.textContent = String(to);
      return;
    }

    state.busy = true;
    el.classList.remove("m-count-pop");
    void el.offsetWidth;
    el.classList.add("m-count-pop");

    var start = global.performance.now();
    var duration = 620;

    function tick(now) {
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 4);
      el.textContent = String(Math.round(from + (to - from) * eased));

      if (progress < 1) {
        raf(tick);
      } else {
        el.textContent = String(to);
        global.setTimeout(function () {
          state.busy = false;
          el.classList.remove("m-count-pop");
        }, 0);
      }
    }

    raf(tick);
  }

  function watchCounter(el) {
    if (!el || el.__mCounter) return;
    el.__mCounter = { value: parseNumber(el.textContent), busy: false };
    var state = el.__mCounter;

    var observer = new MutationObserver(function () {
      if (state.busy) return;
      var next = parseNumber(el.textContent);
      if (next == null) {
        state.value = null;
        return;
      }
      var from = state.value == null ? 0 : state.value;
      if (next === from) {
        state.value = next;
        return;
      }
      state.value = next;
      animateCounter(el, from, next, state);
    });

    observer.observe(el, { childList: true, characterData: true, subtree: true });
  }

  function setupCounters() {
    [
      "statPlayers",
      "statServers",
      "statSlots",
      "statFav",
      "sidePlayers",
      "sideServers",
      "sideSlots",
      "navFavCount"
    ].forEach(function (id) {
      watchCounter(doc.getElementById(id));
    });
  }

  /* ---------------- 指针效果 ---------------- */
  function bindTilt(el) {
    if (el.__mTilt) return;
    el.__mTilt = true;
    var frame = 0;

    function move(event) {
      if (frame) return;
      frame = raf(function () {
        frame = 0;
        var rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var x = (event.clientX - rect.left) / rect.width;
        var y = (event.clientY - rect.top) / rect.height;
        var max = el.classList.contains("quick-card") ? 5 : 3.2;
        el.style.setProperty("--m-rx", ((y - 0.5) * -max).toFixed(2) + "deg");
        el.style.setProperty("--m-ry", ((x - 0.5) * max).toFixed(2) + "deg");
        el.style.setProperty("--m-mx", (x * 100).toFixed(1) + "%");
        el.style.setProperty("--m-my", (y * 100).toFixed(1) + "%");
      });
    }

    function leave() {
      if (frame) {
        global.cancelAnimationFrame(frame);
        frame = 0;
      }
      el.style.removeProperty("--m-rx");
      el.style.removeProperty("--m-ry");
      el.style.removeProperty("--m-mx");
      el.style.removeProperty("--m-my");
    }

    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave, { passive: true });
  }

  function bindMagnetic(el) {
    if (el.__mMag) return;
    el.__mMag = true;
    el.classList.add("m-magnetic");
    var frame = 0;

    function move(event) {
      if (frame) return;
      frame = raf(function () {
        frame = 0;
        var rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var x = (event.clientX - rect.left) / rect.width - 0.5;
        var y = (event.clientY - rect.top) / rect.height - 0.5;
        el.style.setProperty("--m-tx", (x * 4).toFixed(2) + "px");
        el.style.setProperty("--m-ty", (y * 4).toFixed(2) + "px");
      });
    }

    function leave() {
      if (frame) {
        global.cancelAnimationFrame(frame);
        frame = 0;
      }
      el.style.removeProperty("--m-tx");
      el.style.removeProperty("--m-ty");
    }

    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave, { passive: true });
  }

  function bindRipple(el) {
    if (el.__mRipple) return;
    el.__mRipple = true;
    el.classList.add("m-ripple-host");

    el.addEventListener("pointerdown", function (event) {
      if (reduce) return;
      var rect = el.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 1.6;
      var ripple = doc.createElement("span");
      ripple.className = "m-ripple";
      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.left = (event.clientX - rect.left - size / 2) + "px";
      ripple.style.top = (event.clientY - rect.top - size / 2) + "px";
      el.appendChild(ripple);
      global.setTimeout(function () {
        if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
      }, 700);
    }, { passive: true });
  }

  function bindUnderline(el) {
    if (el.__mUnderline || hasPseudo(el, "::after")) return;
    el.__mUnderline = true;
    el.classList.add("m-underline");
  }

  function bindBeam(el) {
    if (el.__mBeam || hasPseudo(el, "::after")) return;
    el.__mBeam = true;
    el.classList.add("m-beam");
    if (el.classList.contains("is-rec")) el.classList.add("is-always");
  }

  function bindHoverLift(el) {
    if (el.__mHoverLift) return;
    el.__mHoverLift = true;
    el.classList.add("m-hover-lift");
  }

  function setupCursorGlow() {
    if (cursorGlowReady || reduce || lite || !fine) return;
    cursorGlowReady = true;

    var glow = doc.createElement("div");
    glow.className = "m-cursor-glow";
    glow.setAttribute("aria-hidden", "true");
    body.appendChild(glow);

    var targetX = global.innerWidth / 2;
    var targetY = global.innerHeight / 2;
    var x = targetX;
    var y = targetY;
    var frame = 0;
    var active = false;

    function loop() {
      frame = 0;
      x += (targetX - x) * 0.18;
      y += (targetY - y) * 0.18;
      glow.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";
      if (Math.abs(targetX - x) > 0.5 || Math.abs(targetY - y) > 0.5) {
        frame = raf(loop);
      }
    }

    function move(event) {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!active) {
        active = true;
        glow.classList.add("on");
      }
      if (!frame) frame = raf(loop);
    }

    function leave() {
      active = false;
      glow.classList.remove("on");
    }

    doc.addEventListener("pointermove", move, { passive: true });
    doc.addEventListener("pointerleave", leave, { passive: true });
  }

  function setupPointer() {
    if (reduce) return;

    if (lite) {
      all(".stat, .focus-main, .newslist li, .tile, .block, .g").forEach(bindHoverLift);
      all(".sec-hd .more, .foot-link, .link-btn").forEach(bindUnderline);
      return;
    }

    if (!fine) return;

    var tiltSelectors = [
      ".card",
      ".block",
      ".g",
      ".stat",
      ".focus-main",
      ".cl-i",
      ".quick-card",
      ".server-card",
      ".tool",
      ".aside-card",
      ".quick-empty"
    ];

    all(tiltSelectors.join(",")).forEach(function (el) {
      if (el.classList.contains("rv") || el.closest(".rv") || hasPseudo(el, "::before")) {
        bindHoverLift(el);
        return;
      }
      el.classList.add("m-tilt");
      bindTilt(el);
    });

    all(".newslist li, .side-panel").forEach(bindHoverLift);
    all(".quick-room a, .quick-card.is-rec").forEach(bindBeam);
    all([
      ".btn-primary",
      ".btn-xl",
      ".enter",
      ".quick-room a",
      ".shortcut-btn",
      "#quickJoinBtn"
    ].join(",")).forEach(bindMagnetic);

    all(".nav-links a, .foot-link, .link-btn, .aside-link").forEach(bindUnderline);

    setupCursorGlow();
  }

  function setupRipples() {
    if (reduce) return;
    all([
      ".btn",
      ".icon-btn",
      ".seg",
      ".chip",
      ".tool",
      ".copy-btn",
      ".shortcut-btn",
      ".notice-close",
      ".modal-close",
      ".sp-close",
      ".btt",
      ".arrows button"
    ].join(",")).forEach(bindRipple);
  }

  /* ---------------- 彩纸 ---------------- */
  function burst(x, y) {
    if (reduce || lite) return;
    var colors = ["#22D97E", "#06D8A0", "#F5C15A", "#F2F5F3", "#3B82F6"];

    for (var i = 0; i < 10; i++) {
      var piece = doc.createElement("span");
      piece.className = "m-confetti-piece";
      var angle = Math.random() * Math.PI * 2;
      var distance = 34 + Math.random() * 56;
      piece.style.left = x + "px";
      piece.style.top = y + "px";
      piece.style.background = colors[i % colors.length];
      piece.style.setProperty("--dx", (Math.cos(angle) * distance).toFixed(1) + "px");
      piece.style.setProperty("--dy", (Math.sin(angle) * distance + 28).toFixed(1) + "px");
      piece.style.setProperty("--rot", (Math.random() * 540 - 270).toFixed(0) + "deg");
      body.appendChild(piece);
      (function (node) {
        global.setTimeout(function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        }, 950);
      })(piece);
    }
  }

  function setupConfetti() {
    doc.addEventListener("pointerdown", function (event) {
      var button = event.target.closest('[data-action="fav"]');
      if (!button || button.classList.contains("is-on")) return;
      var rect = button.getBoundingClientRect();
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, { passive: true });
  }

  /* ---------------- 错开容器 ---------------- */
  function setupStagger() {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -20px 0px" });

    all(".m-stagger").forEach(function (el) {
      if (el.classList.contains("rv") || el.classList.contains("he") || el.classList.contains("in")) return;
      var rect = el.getBoundingClientRect();
      if (rect.top < global.innerHeight * 0.92) {
        el.classList.add("in");
      } else {
        observer.observe(el);
      }
    });
  }

  /* ---------------- 刷新动态内容 ---------------- */
  function refresh() {
    if (!ready) return;
    setupCounters();
    setupPointer();
    setupRipples();
  }

  function init() {
    if (!body) body = doc.body;
    if (!body) return;

    html.classList.add("motion-ready");
    setupCounters();
    setupTypewriter();
    setupPointer();
    setupRipples();
    setupConfetti();
    setupStagger();
    ready = true;
  }

  global.BSPMotion = {
    refresh: refresh,
    init: init,
    burst: burst
  };

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window, document);
