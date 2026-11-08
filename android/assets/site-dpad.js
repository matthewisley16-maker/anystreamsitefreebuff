(function () {
  if (window.__anystreamSiteDpadInstalled) return;
  window.__anystreamSiteDpadInstalled = true;

  var MODE = window.__anystreamSiteNavMode === "pointer" ? "pointer" : "dpad";
  var focused = null;
  var saved = null;
  var pointer = { x: 0, y: 0, overlay: null, target: null, saved: null };
  var SELECTOR = "a[href], area[href], button, input, select, textarea, summary, " +
    "[contenteditable='true'], [tabindex]:not([tabindex='-1']), " +
    "[role='button'], [role='link'], [role='menuitem'], [role='tab'], " +
    "[role='checkbox'], [role='option'], [onclick]";

  function visible(el) {
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    if (el.closest && el.closest("[aria-hidden='true']")) return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" ||
        style.opacity === "0" || style.pointerEvents === "none") return false;
    var r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  // Include focusable elements inside open shadow roots; some TV sites use
  // custom elements for their navigation.
  function collect(root, out) {
    var nodes;
    try { nodes = root.querySelectorAll(SELECTOR); } catch (err) { nodes = []; }
    for (var i = 0; i < nodes.length; i++) out.push(nodes[i]);

    var all;
    try { all = root.querySelectorAll("*"); } catch (err) { all = []; }
    for (var j = 0; j < all.length; j++) {
      if (all[j].shadowRoot) collect(all[j].shadowRoot, out);
    }
  }

  function focusables() {
    var out = [];
    collect(document, out);
    var clean = [];
    for (var i = 0; i < out.length; i++) {
      if (out.indexOf(out[i]) !== i) continue;
      if (visible(out[i])) clean.push(out[i]);
    }
    return clean;
  }

  function restore() {
    if (!saved) return;
    try {
      saved.el.style.outline = saved.outline;
      saved.el.style.outlineOffset = saved.offset;
    } catch (err) { /* the element may have been removed */ }
    saved = null;
  }

  function mark(el) {
    if (focused === el) return;
    restore();
    focused = el;
    if (!el) return;
    saved = { el: el, outline: el.style.outline, offset: el.style.outlineOffset };
    el.style.outline = "3px solid #e50914";
    el.style.outlineOffset = "3px";
  }

  function focusEl(el) {
    if (!el) return false;
    try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); }
    mark(el);
    try { el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" }); } catch (err) {}
    return true;
  }

  function scroll(dir) {
    var x = window.scrollX || window.pageXOffset || 0;
    var y = window.scrollY || window.pageYOffset || 0;
    var stepY = Math.max(160, Math.round(window.innerHeight * 0.55));
    var stepX = Math.max(160, Math.round(window.innerWidth * 0.55));
    var dx = 0;
    var dy = 0;
    if (dir === "up") dy = -stepY;
    else if (dir === "down") dy = stepY;
    else if (dir === "left") dx = -stepX;
    else dx = stepX;
    try {
      window.scrollTo({ left: x + dx, top: y + dy, behavior: "auto" });
    } catch (err) {
      window.scrollBy(dx, dy);
    }
    return true;
  }

  function moveFocus(dir) {
    var list = focusables();
    if (!list.length) return scroll(dir);

    var current = null;
    if (focused && list.indexOf(focused) !== -1) current = focused;
    else if (list.indexOf(document.activeElement) !== -1) current = document.activeElement;
    if (!current) return focusEl(list[0]);

    var r = current.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var best = null;
    var score = Infinity;

    list.forEach(function (el) {
      if (el === current) return;
      var q = el.getBoundingClientRect();
      var dx = q.left + q.width / 2 - cx;
      var dy = q.top + q.height / 2 - cy;
      var main;
      var cross;
      if (dir === "right") {
        if (dx < 4) return;
        main = dx;
        cross = Math.max(0, Math.max(r.top, q.top) - Math.min(r.bottom, q.bottom));
      } else if (dir === "left") {
        if (dx > -4) return;
        main = -dx;
        cross = Math.max(0, Math.max(r.top, q.top) - Math.min(r.bottom, q.bottom));
      } else if (dir === "down") {
        if (dy < 4) return;
        main = dy;
        cross = Math.max(0, Math.max(r.left, q.left) - Math.min(r.right, q.right));
      } else {
        if (dy > -4) return;
        main = -dy;
        cross = Math.max(0, Math.max(r.left, q.left) - Math.min(r.right, q.right));
      }
      var next = main + cross * 2.5;
      if (next < score) {
        score = next;
        best = el;
      }
    });

    if (!best) return scroll(dir);
    return focusEl(best);
  }

  function selectFocus() {
    var list = focusables();
    var el = document.activeElement;
    if (list.indexOf(el) === -1) {
      if (!list.length) return false;
      return focusEl(list[0]);
    }
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      focusEl(el);
      var type = (el.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio" || type === "button" || type === "submit") el.click();
      return true;
    }
    el.click();
    return true;
  }

  function ensurePointer() {
    if (pointer.overlay && document.documentElement.contains(pointer.overlay)) {
      pointer.overlay.style.display = "block";
      return pointer.overlay;
    }
    var overlay = document.createElement("div");
    overlay.id = "__anystream_site_pointer";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;" +
      "border:2px solid #fff;border-radius:50%;background:rgba(229,9,20,.55);" +
      "box-shadow:0 0 0 2px rgba(0,0,0,.8),0 0 10px rgba(0,0,0,.9);" +
      "transform:translate(-50%,-50%);z-index:2147483647;pointer-events:none;display:block;";
    document.documentElement.appendChild(overlay);
    pointer.overlay = overlay;
    if (!pointer.x || !pointer.y) {
      pointer.x = Math.round(window.innerWidth / 2);
      pointer.y = Math.round(window.innerHeight / 2);
    }
    return overlay;
  }

  function restorePointerTarget() {
    if (!pointer.target || !pointer.saved) {
      pointer.target = null;
      pointer.saved = null;
      return;
    }
    try {
      pointer.target.style.outline = pointer.saved.outline;
      pointer.target.style.outlineOffset = pointer.saved.offset;
    } catch (err) { /* the target may be gone */ }
    pointer.target = null;
    pointer.saved = null;
  }

  function actionableAt(x, y) {
    var target = document.elementFromPoint(x, y);
    if (!target || target === pointer.overlay) return null;
    if (target.closest) {
      var hit = target.closest(SELECTOR);
      if (hit) return hit;
    }
    return target;
  }

  function drawPointer() {
    ensurePointer();
    pointer.x = Math.max(1, Math.min(window.innerWidth - 2, pointer.x));
    pointer.y = Math.max(1, Math.min(window.innerHeight - 2, pointer.y));
    pointer.overlay.style.left = pointer.x + "px";
    pointer.overlay.style.top = pointer.y + "px";

    var target = actionableAt(pointer.x, pointer.y);
    if (target !== pointer.target) {
      restorePointerTarget();
      if (target) {
        pointer.target = target;
        pointer.saved = { outline: target.style.outline, offset: target.style.outlineOffset };
        target.style.outline = "3px solid #e50914";
        target.style.outlineOffset = "3px";
      }
    }
  }

  function scrollPointer(stepX, stepY) {
    var x = window.scrollX || window.pageXOffset || 0;
    var y = window.scrollY || window.pageYOffset || 0;
    var dx = 0;
    var dy = 0;
    if (pointer.x < stepX) dx = -stepX * 2;
    else if (pointer.x > window.innerWidth - stepX) dx = stepX * 2;
    if (pointer.y < stepY) dy = -stepY * 2;
    else if (pointer.y > window.innerHeight - stepY) dy = stepY * 2;
    if (!dx && !dy) return;
    try {
      window.scrollTo({ left: x + dx, top: y + dy, behavior: "auto" });
    } catch (err) {
      window.scrollBy(dx, dy);
    }
  }

  function movePointer(dir) {
    ensurePointer();
    var stepX = Math.max(24, Math.min(64, Math.round(window.innerWidth * 0.045)));
    var stepY = Math.max(24, Math.min(64, Math.round(window.innerHeight * 0.055)));
    if (dir === "left") pointer.x -= stepX;
    else if (dir === "right") pointer.x += stepX;
    else if (dir === "up") pointer.y -= stepY;
    else if (dir === "down") pointer.y += stepY;

    pointer.x = Math.max(1, Math.min(window.innerWidth - 2, pointer.x));
    pointer.y = Math.max(1, Math.min(window.innerHeight - 2, pointer.y));
    scrollPointer(stepX, stepY);
    drawPointer();
    return true;
  }

  function clickPointer() {
    ensurePointer();
    var target = actionableAt(pointer.x, pointer.y);
    if (!target) return false;
    try { target.focus({ preventScroll: true }); } catch (err) {}
    var options = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: pointer.x,
      clientY: pointer.y,
      button: 0
    };
    try { target.dispatchEvent(new MouseEvent("mousedown", options)); } catch (err) {}
    try { target.dispatchEvent(new MouseEvent("mouseup", options)); } catch (err) {}
    try { target.click(); } catch (err) {}
    return true;
  }

  function hidePointer() {
    restorePointerTarget();
    if (pointer.overlay) pointer.overlay.style.display = "none";
  }

  function setMode(mode) {
    MODE = mode === "pointer" ? "pointer" : "dpad";
    if (MODE === "pointer") {
      ensurePointer();
      drawPointer();
    } else {
      hidePointer();
    }
  }

  function handle(key) {
    if (key === "select") return MODE === "pointer" ? clickPointer() : selectFocus();
    if (key === "up" || key === "down" || key === "left" || key === "right") {
      return MODE === "pointer" ? movePointer(key) : moveFocus(key);
    }
    return false;
  }

  window.__anystreamSiteKey = handle;
  window.__anystreamSiteFocus = function () {
    if (MODE === "pointer") {
      ensurePointer();
      drawPointer();
      return true;
    }
    var list = focusables();
    return list.length ? focusEl(list[0]) : false;
  };
  window.__anystreamSiteSetMode = setMode;

  document.addEventListener("keydown", function (event) {
    // The Android shell sets this flag and calls __anystreamSiteKey directly.
    // Keep the listener as a browser fallback for testing and non-TV builds.
    if (window.__anystreamSiteNativeKeys) return;
    var code = event.keyCode;
    var key = event.key === "ArrowLeft" || code === 37 ? "left"
      : event.key === "ArrowRight" || code === 39 ? "right"
      : event.key === "ArrowDown" || code === 40 ? "down"
      : event.key === "ArrowUp" || code === 38 ? "up"
      : event.key === "Enter" || event.key === " " || code === 13 || code === 23 || code === 66 ? "select" : null;
    if (!key) return;
    if (handle(key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  function installMode() {
    if (MODE === "pointer") {
      ensurePointer();
      drawPointer();
      return;
    }
    setTimeout(function () {
      if (MODE !== "dpad") return;
      var active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) {
        var list = focusables();
        if (list.length) focusEl(list[0]);
      }
    }, 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installMode);
  } else {
    installMode();
  }
})();
