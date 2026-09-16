/* ============================================================
   背水对战平台 · 官网动效库（与客户端 LoadingKit / LayoutAnimationHelper 对齐）
   7 个加载态 + 3 组形态动画，零依赖
   用法：<link rel="stylesheet" href="bsp-anim.css"> + <script src="bsp-anim.js" defer></script>
   自动初始化 data-bsp-* 属性；也可直接调用 BSPAnim.*
   ============================================================ */
(function (global) {
  "use strict";

  var reduceMotion = global.matchMedia
    ? global.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  /* ---------------- ⑦ 全屏遮罩 Page Loader ---------------- */
  var pageLoader = {
    _node: null,
    _shownAt: 0,
    _minMs: 400,

    node: function () {
      if (this._node) return this._node;
      var wrap = el("div", "bsp-page-loader");
      wrap.innerHTML =
        '<div class="bsp-ring bsp-ring--lg"></div>' +
        '<div class="bsp-page-loader__msg">加载中...</div>' +
        '<div class="bsp-page-loader__sub"></div>' +
        '<div class="bsp-linear"><div class="bsp-linear__fill"></div></div>';
      document.body.appendChild(wrap);
      this._node = wrap;
      return wrap;
    },

    show: function (msg, sub) {
      var n = this.node();
      if (msg) n.querySelector(".bsp-page-loader__msg").textContent = msg;
      n.querySelector(".bsp-page-loader__sub").textContent = sub || "";
      n.style.display = "flex";
      // 触发过渡
      void n.offsetWidth;
      n.classList.add("is-visible");
      this._shownAt = Date.now();
      return this;
    },

    setProgress: function (ratio) {
      var fill = this.node().querySelector(".bsp-linear__fill");
      if (fill) fill.style.width = Math.max(0, Math.min(1, ratio)) * 100 + "%";
    },

    hide: function () {
      var self = this;
      var n = this.node();
      var wait = Math.max(0, this._minMs - (Date.now() - this._shownAt));
      return new Promise(function (resolve) {
        setTimeout(function () {
          n.classList.remove("is-visible");
          setTimeout(function () {
            n.style.display = "none";
            resolve();
          }, 200);
        }, wait);
      });
    }
  };

  /* ---------------- ④⑤ 骨架屏 + 微光 ---------------- */
  function skeletonRows(rows, opts) {
    opts = opts || {};
    var frag = document.createDocumentFragment();
    var count = Math.max(1, rows | 0);
    for (var i = 0; i < count; i++) {
      var row = el("div", "bsp-skeleton-row");
      if (opts.avatar !== false) row.appendChild(el("div", "bsp-skeleton bsp-skeleton--circle"));
      var lines = el("div", "bsp-skeleton-row bsp-skeleton--lines");
      lines.style.display = "block";
      lines.style.margin = "0";
      var first = el("div", "bsp-skeleton bsp-skeleton--text");
      first.style.width = (i === count - 1 ? opts.lastWidth || "60%" : "100%");
      lines.appendChild(first);
      if (opts.twoLines) {
        var second = el("div", "bsp-skeleton bsp-skeleton--text");
        second.style.width = "40%";
        second.style.marginBottom = "0";
        lines.appendChild(second);
      }
      row.appendChild(lines);
      frag.appendChild(row);
    }
    return frag;
  }

  /** 把容器内容换成骨架屏，返回一个 reveal() 用于换回真实内容 */
  function skeleton(container, rows, opts) {
    if (!container) return { reveal: function () {} };
    if (!container.dataset.bspOriginal) container.dataset.bspOriginal = container.innerHTML;

    container.innerHTML = "";
    container.appendChild(skeletonRows(rows || 4, opts));

    return {
      reveal: function () {
        container.innerHTML = container.dataset.bspOriginal;
        container.dataset.bspOriginal = "";
        // 内容淡入
        Array.prototype.forEach.call(container.children, function (child) {
          child.style.opacity = "0";
          child.style.transition = "opacity .3s ease";
          void child.offsetWidth;
          child.style.opacity = "1";
        });
      }
    };
  }

  /* ---------------- ②③ 进度 ---------------- */
  function linear(node, ratio) {
    if (!node) return;
    var fill = node.querySelector(".bsp-linear__fill") || node;
    fill.style.width = Math.max(0, Math.min(1, ratio)) * 100 + "%";
  }

  function circular(node, ratio) {
    if (!node) return;
    ratio = Math.max(0, Math.min(1, ratio));
    var fill = node.querySelector(".bsp-circular__fill");
    var text = node.querySelector(".bsp-circular__text");
    if (fill) {
      var r = parseFloat(fill.getAttribute("r")) || 24;
      var c = 2 * Math.PI * r;
      fill.style.strokeDasharray = c;
      fill.style.strokeDashoffset = c * (1 - Math.min(ratio, 0.9999));
    }
    if (text) text.textContent = Math.round(ratio * 100) + "%";
  }

  /** 生成圆形进度标记 */
  function buildCircular(size, ratio) {
    size = size || 56;
    var stroke = Math.max(3, Math.round(size / 12));
    var r = (size - stroke) / 2;
    var wrap = el("div", "bsp-circular");
    wrap.style.width = size + "px";
    wrap.style.height = size + "px";
    wrap.innerHTML =
      '<svg width="' + size + '" height="' + size + '">' +
      '<circle class="bsp-circular__track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r +
      '" fill="none" stroke-width="' + stroke + '"/>' +
      '<circle class="bsp-circular__fill" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r +
      '" fill="none" stroke-width="' + stroke + '"/>' +
      "</svg>" +
      '<div class="bsp-circular__text">0%</div>';
    circular(wrap, ratio || 0);
    return wrap;
  }

  /* ---------------- ⑥ 按钮加载 ---------------- */
  function buttonLoading(node) {
    if (!node) return function () {};
    var width = node.getBoundingClientRect().width;
    if (width > 1) node.style.minWidth = width + "px"; // 锁宽防跳变
    node.classList.add("bsp-btn", "is-loading");
    return function done() {
      node.classList.remove("is-loading");
      node.style.minWidth = "";
    };
  }

  /* ---------------- ⑧ 胶囊 ⇄ 信息卡 ---------------- */
  function expandCapsule(capsule, toWidth, toHeight) {
    if (!capsule) return;
    var body = capsule.querySelectorAll(".bsp-reveal");
    var rect = capsule.getBoundingClientRect();

    capsule.style.width = rect.width + "px";
    capsule.style.height = rect.height + "px";

    // 先增高、再拓宽（与客户端 ExpandCapsuleToCard 一致）
    requestAnimationFrame(function () {
      capsule.style.height = (toHeight || capsule.scrollHeight) + "px";
      setTimeout(function () {
        capsule.style.width = (toWidth || rect.width) + "px";
      }, 180);
    });

    Array.prototype.forEach.call(body, function (part, i) {
      setTimeout(function () { part.classList.add("is-shown"); }, 200 + i * 70);
    });
  }

  function collapseCapsule(capsule, toWidth, toHeight, checkEl) {
    if (!capsule) return;
    var body = capsule.querySelectorAll(".bsp-reveal");
    // 逆序收回正文与次要控件
    Array.prototype.slice.call(body).reverse().forEach(function (part, i) {
      setTimeout(function () { part.classList.remove("is-shown"); }, i * 40);
    });

    setTimeout(function () {
      capsule.style.width = (toWidth || "210px") + (typeof toWidth === "number" ? "px" : "");
      setTimeout(function () {
        capsule.style.height = (toHeight || 52) + (typeof toHeight === "number" ? "px" : "");
      }, 150);
    }, body.length * 40 + 60);

    if (checkEl) {
      setTimeout(function () {
        checkEl.style.opacity = "1";
        checkEl.classList.add("bsp-pop");
      }, body.length * 40 + 320);
    }
  }

  /* ---------------- ⑨ 尺寸变形 ---------------- */
  function morphSize(node, width, height, onDone) {
    if (!node) return;
    node.classList.add("bsp-morphable");
    requestAnimationFrame(function () {
      if (width != null) node.style.width = width + "px";
      if (height != null) node.style.height = height + "px";
    });
    if (onDone) setTimeout(onDone, 520);
  }

  function popValue(node) {
    if (!node) return;
    node.classList.remove("bsp-pop");
    void node.offsetWidth;
    node.classList.add("bsp-pop");
  }

  /* ---------------- 自动初始化 ---------------- */
  function autoInit() {
    // ⑦ 页面首开全屏遮罩
    if (document.querySelector("[data-bsp-page-loader]")) {
      pageLoader.show(
        document.body.getAttribute("data-bsp-loader-msg") || "正在加载背水对战平台...",
        document.body.getAttribute("data-bsp-loader-sub") || ""
      );
      var done = function () { pageLoader.hide(); };
      if (document.readyState === "complete") setTimeout(done, 150);
      else global.addEventListener("load", function () { setTimeout(done, 150); });
    }

    // ⑥ 按钮/链接加载（点击后转圈，防止重复点击）
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-bsp-loading]");
      if (!btn) return;
      if (btn.classList.contains("is-loading")) { e.preventDefault(); return; }
      var delay = parseInt(btn.getAttribute("data-bsp-loading"), 10);
      if (isNaN(delay)) delay = 600;
      var isLink = btn.tagName === "A" && btn.getAttribute("href");
      var href = isLink ? btn.getAttribute("href") : null;
      var target = isLink ? btn.getAttribute("target") : null;
      e.preventDefault();
      var done = buttonLoading(btn);
      setTimeout(function () {
        done();
        if (href && href !== "#") {
          if (target === "_blank") global.open(href, "_blank");
          else global.location.href = href;
        }
      }, delay);
    });

    // ⑧ 胶囊展开 / 反向收回
    Array.prototype.forEach.call(document.querySelectorAll("[data-bsp-capsule]"), function (cap) {
      var expanded = false;
      var check = cap.querySelector("[data-bsp-check]");
      cap.addEventListener("click", function (e) {
        if (e.target.closest("[data-bsp-no-toggle]")) return;
        var w = parseFloat(cap.getAttribute("data-bsp-w")) || 300;
        var h = parseFloat(cap.getAttribute("data-bsp-h")) || 196;
        var cw = parseFloat(cap.getAttribute("data-bsp-cw")) || 210;
        var ch = parseFloat(cap.getAttribute("data-bsp-ch")) || 52;
        if (!expanded) { expanded = true; expandCapsule(cap, w, h); }
        else { expanded = false; collapseCapsule(cap, cw, ch, check); }
      });
    });

    // ③ 圆形进度占位生成
    Array.prototype.forEach.call(document.querySelectorAll("[data-bsp-circular]"), function (host) {
      var size = parseInt(host.getAttribute("data-bsp-circular"), 10) || 56;
      var ratio = parseFloat(host.getAttribute("data-bsp-ratio")) || 0;
      var node = buildCircular(size, ratio);
      host.appendChild(node);
    });
  }

  var BSPAnim = {
    reduceMotion: reduceMotion,
    pageLoader: pageLoader,
    skeleton: skeleton,
    skeletonRows: skeletonRows,
    linear: linear,
    circular: circular,
    buildCircular: buildCircular,
    buttonLoading: buttonLoading,
    expandCapsule: expandCapsule,
    collapseCapsule: collapseCapsule,
    morphSize: morphSize,
    popValue: popValue
  };

  global.BSPAnim = BSPAnim;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})(window);
