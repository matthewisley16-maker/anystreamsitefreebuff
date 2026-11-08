(function () {
  if (window.__anystreamSiteDpadInstalled) return;
  window.__anystreamSiteDpadInstalled = true;

  var MODE = window.__anystreamSiteNavMode === "pointer" ? "pointer" : "dpad";
  var focused = null;
  var saved = null;
  var pointer = { x: 0, y: 0, overlay: null };
  var lastPointerScrollAt = 0;
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
    var el = focused && list.indexOf(focused) !== -1 ? focused : document.activeElement;
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
    return activateElement(el);
  }

  function activateElement(target, eventTarget, shouldFocus, clickX, clickY) {
    if (!target) return false;
    if (shouldFocus !== false) {
      try { target.focus({ preventScroll: true }); } catch (err) {}
    }
    var source = eventTarget || target;
    var r = target.getBoundingClientRect();
    var options = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: clickX != null ? clickX : r.left + r.width / 2,
      clientY: clickY != null ? clickY : r.top + r.height / 2,
      button: 0
    };
    try { source.dispatchEvent(new MouseEvent("mousedown", options)); } catch (err) {}
    try { source.dispatchEvent(new MouseEvent("mouseup", options)); } catch (err) {}
    // target.click() activates links and buttons; using the nearest link/button
    // for a child element is what makes nested hyperlink text clickable.
    try { target.click(); } catch (err) {}
    return true;
  }

  function ensurePointer() {
    if (pointer.overlay && document.documentElement.contains(pointer.overlay)) {
      pointer.overlay.style.display = "block";
      setPointerScrollbars(true);
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
    setPointerScrollbars(true);
    if (!pointer.x || !pointer.y) {
      pointer.x = Math.round(window.innerWidth / 2);
      pointer.y = Math.round(window.innerHeight / 2);
    }
    return overlay;
  }

  function setPointerScrollbars(hidden) {
    var id = "__anystream_pointer_scrollbars";
    var existing = document.getElementById(id);
    if (!hidden) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    var style = document.createElement("style");
    style.id = id;
    style.textContent = "html,body{scrollbar-width:none!important;}" +
      "html::-webkit-scrollbar,body::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}" +
      "*{-webkit-tap-highlight-color:transparent!important;}" +
      ":focus,:focus-visible{outline:none!important;}";
    (document.head || document.documentElement).appendChild(style);
  }

  function drawPointer() {
    ensurePointer();
    pointer.x = Math.max(1, Math.min(window.innerWidth - 2, pointer.x));
    pointer.y = Math.max(1, Math.min(window.innerHeight - 2, pointer.y));
    pointer.overlay.style.left = pointer.x + "px";
    pointer.overlay.style.top = pointer.y + "px";
  }

  function scrollPointer(dir) {
    // Pointer movement is independent of the page scroller. Only a deliberate
    // press while the dot is already at the top or bottom edge scrolls, and
    // only vertically; the side scroller never moves the page.
    if (dir !== "up" && dir !== "down") return;
    var atEdge = dir === "up" ? pointer.y <= 3 : pointer.y >= window.innerHeight - 4;
    if (!atEdge) return;
    var now = Date.now();
    if (now - lastPointerScrollAt < 250) return;
    lastPointerScrollAt = now;
    var step = 32;
    var y = window.scrollY || window.pageYOffset || 0;
    try {
      window.scrollTo({ left: window.scrollX || window.pageXOffset || 0, top: y + (dir === "up" ? -step : step), behavior: "auto" });
    } catch (err) {
      window.scrollBy(0, dir === "up" ? -step : step);
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
    scrollPointer(dir);
    drawPointer();
    return true;
  }

  function clickPointer() {
    ensurePointer();
    // Android's native WebView tap handles links inside cross-origin frames
    // and links covered by transparent layout layers, which a DOM click cannot.
    if (window.__anystreamPointerBridge && typeof window.__anystreamPointerBridge.clickAt === "function") {
      try {
        window.__anystreamPointerBridge.clickAt(pointer.x / window.innerWidth, pointer.y / window.innerHeight);
        return true;
      } catch (err) {}
    }
    var stack = [];
    try {
      stack = document.elementsFromPoint ? document.elementsFromPoint(pointer.x, pointer.y) : [document.elementFromPoint(pointer.x, pointer.y)];
    } catch (err) {
      stack = [document.elementFromPoint(pointer.x, pointer.y)];
    }
    var exact = stack.length ? stack[0] : null;
    if (!exact || exact === pointer.overlay) return false;
    var hit = exact;
    for (var i = 0; i < stack.length; i++) {
      var candidate = stack[i];
      if (!candidate || candidate === pointer.overlay) continue;
      var action = candidate.closest ? candidate.closest(SELECTOR) : null;
      if (action) { hit = action; break; }
    }
    var needsKeyboard = /^(INPUT|TEXTAREA|SELECT)$/.test(hit.tagName) || hit.isContentEditable;
    return activateElement(hit, exact, needsKeyboard, pointer.x, pointer.y);
  }

  function hidePointer() {
    setPointerScrollbars(false);
    if (pointer.overlay) pointer.overlay.style.display = "none";
  }

  function setMode(mode) {
    MODE = mode === "pointer" ? "pointer" : "dpad";
    if (MODE === "pointer") {
      restore();
      focused = null;
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
