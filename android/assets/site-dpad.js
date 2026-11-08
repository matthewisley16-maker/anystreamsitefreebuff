(function () {
  if (window.__anystreamSiteDpadInstalled) return;
  window.__anystreamSiteDpadInstalled = true;

  var focused = null;
  var saved = null;
  var SELECTOR = "a[href], button, input, select, textarea, [contenteditable='true'], [tabindex]:not([tabindex='-1']), [role='button'], [role='link']";

  function visible(el) {
    if (!el || el.disabled) return false;
    if (el.closest && el.closest("[aria-hidden='true']")) return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" ||
        style.opacity === "0" || style.pointerEvents === "none") return false;
    var r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  function focusables() {
    var nodes = document.querySelectorAll(SELECTOR);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (visible(nodes[i])) out.push(nodes[i]);
    }
    return out;
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
    try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (err) {}
  }

  function focusEl(el) {
    if (!el) return false;
    try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); }
    mark(el);
    return true;
  }

  function scroll(dir) {
    var x = window.scrollX || window.pageXOffset || 0;
    var y = window.scrollY || window.pageYOffset || 0;
    var stepY = Math.max(140, Math.round(window.innerHeight * 0.42));
    var stepX = Math.max(140, Math.round(window.innerWidth * 0.42));
    var dx = 0;
    var dy = 0;
    if (dir === "up") dy = -stepY;
    else if (dir === "down") dy = stepY;
    else if (dir === "left") dx = -stepX;
    else dx = stepX;
    try {
      window.scrollTo({ left: x + dx, top: y + dy, behavior: "smooth" });
    } catch (err) {
      window.scrollBy(dx, dy);
    }
    return true;
  }

  function move(dir) {
    var list = focusables();
    var current = document.activeElement;
    if (!list.length) return scroll(dir);
    if (list.indexOf(current) === -1) return focusEl(list[0]);

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

  function select() {
    var list = focusables();
    var el = document.activeElement;
    if (list.indexOf(el) === -1) {
      if (!list.length) return false;
      return focusEl(list[0]);
    }
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      focusEl(el);
      if (el.type === "checkbox" || el.type === "radio" ||
          el.type === "button" || el.type === "submit") el.click();
      return true;
    }
    el.click();
    return true;
  }

  function handle(key) {
    if (key === "select") return select();
    if (key === "up" || key === "down" || key === "left" || key === "right") return move(key);
    return false;
  }

  window.__anystreamSiteKey = handle;
  window.__anystreamSiteFocus = function () {
    var list = focusables();
    return list.length ? focusEl(list[0]) : false;
  };

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
})();
