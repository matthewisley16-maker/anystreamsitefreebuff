(function () {
  if (window.__anystreamSiteDpadInstalled) return;
  window.__anystreamSiteDpadInstalled = true;

  var MODE = window.__anystreamSiteNavMode === "pointer" ? "pointer" : "dpad";
  var focused = null;
  var saved = null;
  var pointer = { x: 0, y: 0, overlay: null };
  var lastPointerScrollAt = 0;
  var lastFocusScrollAt = 0;
  var scrollMode = false;
  var scrollBadge = null;
  var regionFocusTimer = 0;
  var focusCache = null;
  var focusCacheAt = 0;
  var boundClicks = typeof WeakSet === "function" ? new WeakSet() : null;
  var SELECTOR = "a, area[href], button, input, select, textarea, summary, " +
    "[contenteditable='true'], [tabindex]:not([tabindex='-1']), " +
    "[role='button'], [role='link'], [role='menuitem'], [role='tab'], " +
    "[role='checkbox'], [role='option'], [role='switch'], [role='treeitem'], " +
    "[role='menuitemcheckbox'], [role='menuitemradio'], [onclick], " +
    "[onmousedown], [onpointerdown], [ontouchend], [aria-haspopup], " +
    "[aria-expanded], [data-href], [data-url], [data-link], [data-action], " +
    "[data-click], [data-toggle], [data-bs-toggle], [jsaction]";
  var HINT_RE = /(^|[\s_-])(poster|card|tile|movie|show|episode|channel|thumbnail|thumb|cover|artwork|icon|logo|button|btn|menu-item|nav-item|dropdown|toggle|option|select|choice|play|watch|source|server|quality|season|genre|pagination|page-item|page-link|next|prev|close|remove|clickable)([\s_-]|$)/i;
  var CONTAINER_RE = /(^|[\s_-])(list|grid|row|shelf|carousel|slider|container|wrapper|section|panel|collection|results|items)([\s_-]|$)/i;
  var REGION_SELECTOR = "aside, [role='dialog'], [role='menu'], " +
    "[class*='sidebar'], [id*='sidebar'], [class*='drawer'], [id*='drawer'], " +
    "[class*='side-menu'], [id*='side-menu'], [class*='sideMenu'], [id*='sideMenu'], " +
    "[class*='sidenav'], [id*='sidenav']";
  var SIDEBAR_SELECTOR = "aside, " +
    "[class*='sidebar'], [id*='sidebar'], [class*='drawer'], [id*='drawer'], " +
    "[class*='side-menu'], [id*='side-menu'], [class*='sideMenu'], [id*='sideMenu'], " +
    "[class*='sidenav'], [id*='sidenav']";

  // Anchors around poster images can have a zero-sized box (display:contents
  // or an absolutely positioned image). Use the visible media box so the
  // remote can still focus and activate them.
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    if (r.width > 2 && r.height > 2) return r;
    if (el.querySelector) {
      var media = el.querySelector("img, picture, video, canvas");
      if (media) {
        var m = media.getBoundingClientRect();
        if (m.width > 2 && m.height > 2) return m;
      }
    }
    return r;
  }

  function isMediaElement(el) {
    if (!el || !el.tagName) return false;
    return /^(img|svg|video|canvas)$/i.test(el.tagName) ||
      !!(el.getAttribute && el.getAttribute("role") === "img");
  }

  function markClickTarget(el) {
    if (!el) return;
    if (boundClicks) boundClicks.add(el);
    else {
      try { el.__anystreamClickBound = true; } catch (err) {}
    }
  }

  function hasBoundClick(el) {
    if (!el) return false;
    if (boundClicks) return boundClicks.has(el);
    return !!el.__anystreamClickBound;
  }

  // Catch click listeners added after this script loads, which covers cards
  // created by SPA route changes and infinite-scroll pages. Existing listeners
  // are handled by the property/React/class/image checks below.
  function trackClickListeners() {
    var proto = window.EventTarget && window.EventTarget.prototype;
    if (!proto || proto.__anystreamClickTracked) return;
    var original = proto.addEventListener;
    if (typeof original !== "function") return;
    proto.addEventListener = function (type, listener, options) {
      try {
        if (this && this.nodeType === 1 &&
            /^(click|dblclick|mousedown|mouseup|pointerdown|pointerup|touchstart|touchend)$/i.test(String(type))) {
          markClickTarget(this);
          invalidateFocusables();
        }
      } catch (err) {}
      return original.apply(this, arguments);
    };
    proto.__anystreamClickTracked = true;
  }

  function hasHandlerProperty(el) {
    if (!el) return false;
    var names = ["onclick", "onmousedown", "onmouseup", "onpointerdown",
      "onpointerup", "ontouchend", "ontouchstart"];
    for (var i = 0; i < names.length; i++) {
      if (typeof el[names[i]] === "function") return true;
    }
    return false;
  }

  function propsHaveClick(props) {
    if (!props) return false;
    var names = ["onClick", "onMouseDown", "onMouseUp", "onPointerDown",
      "onPointerUp", "onTouchStart", "onTouchEnd"];
    for (var i = 0; i < names.length; i++) {
      if (typeof props[names[i]] === "function") return true;
    }
    return false;
  }

  function hasReactClick(el) {
    if (!el || !el.getAttribute) return false;
    var keys = [];
    try { keys = Object.keys(el); } catch (err) { return false; }
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("__reactProps$") === 0 ||
          keys[i].indexOf("__reactEventHandlers$") === 0) {
        if (propsHaveClick(el[keys[i]])) return true;
      }
    }
    if (propsHaveClick(el.__preactattr_)) return true;
    var vei = el._vei;
    if (vei) {
      for (var event in vei) {
        if (!/click|mousedown|mouseup|pointerdown|pointerup|touch(start|end)/i.test(event)) continue;
        var invoker = vei[event];
        if (invoker && (typeof invoker === "function" ||
            typeof invoker.value === "function")) return true;
      }
    }
    var vue = el.__vue__;
    return !!(vue && vue.$listeners && typeof vue.$listeners.click === "function");
  }

  function hasJQueryClick(el) {
    var jq = window.jQuery;
    if (!jq || typeof jq._data !== "function") return false;
    try {
      var events = jq._data(el, "events");
      return !!(events && (events.click || events.mousedown || events.pointerdown));
    } catch (err) {
      return false;
    }
  }

  function visible(el, allowPointerNone) {
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    if (el.closest && el.closest("[aria-hidden='true']")) return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" ||
        style.opacity === "0" || (!allowPointerNone && style.pointerEvents === "none")) return false;
    var r = rectOf(el);
    return r.width > 2 && r.height > 2;
  }

  function regions() {
    var nodes = [];
    try { nodes = document.querySelectorAll(REGION_SELECTOR); } catch (err) { nodes = []; }
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (!visible(nodes[i])) continue;
      var r = nodes[i].getBoundingClientRect();
      if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) continue;
      out.push(nodes[i]);
    }
    return out;
  }

  function sidebarRegions() {
    var nodes = [];
    try { nodes = document.querySelectorAll(SIDEBAR_SELECTOR); } catch (err) { nodes = []; }
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (!visible(nodes[i])) continue;
      var r = nodes[i].getBoundingClientRect();
      if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) continue;
      out.push(nodes[i]);
    }
    return out;
  }

  function atPageTop() {
    var y = window.scrollY || window.pageYOffset ||
      (document.documentElement && document.documentElement.scrollTop) || 0;
    return y <= 12;
  }

  // At the very top there is nothing above the first content row. Let Up
  // hand focus to an open sidebar so the remote can reach its entries.
  function focusTopSidebar() {
    if (!atPageTop()) return false;
    var currentRegion = activeRegion();
    var sidebars = sidebarRegions();
    for (var i = 0; i < sidebars.length; i++) {
      if (sidebars[i] === currentRegion) continue;
      var items = regionFocusables(sidebars[i]);
      if (items.length) return focusEl(items[0]);
    }
    return false;
  }

  function containingRegion(el) {
    var list = regions();
    while (el && el !== document.body && el !== document.documentElement) {
      if (list.indexOf(el) !== -1) return el;
      el = el.parentElement;
    }
    return null;
  }

  function regionFocusables(region) {
    if (!region) return [];
    return focusables().filter(function (el) {
      return region === el || region.contains(el);
    });
  }

  function activeRegion() {
    var region = containingRegion(focused);
    if (region) return region;
    return containingRegion(document.activeElement);
  }

  function cancelRegionFocus() {
    if (regionFocusTimer) {
      clearTimeout(regionFocusTimer);
      regionFocusTimer = 0;
    }
  }

  function scheduleRegionFocus(before) {
    cancelRegionFocus();
    regionFocusTimer = setTimeout(function () {
      regionFocusTimer = 0;
      var fresh = regions().filter(function (region) { return before.indexOf(region) === -1; });
      if (!fresh.length) return;
      var items = regionFocusables(fresh[fresh.length - 1]);
      if (items.length) focusEl(items[0]);
    }, 220);
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
      // Movie sites often use plain div/span/li elements with cursor:pointer
      // or tab classes instead of real links and buttons.
      if (isClickableNode(all[j])) out.push(all[j]);
    }
  }

  function invalidateFocusables() {
    focusCache = null;
    focusCacheAt = 0;
  }

  function focusables() {
    var now = Date.now();
    if (focusCache && now - focusCacheAt < 400) return focusCache;

    var out = [];
    collect(document, out);
    var clean = [];
    for (var i = 0; i < out.length; i++) {
      if (out.indexOf(out[i]) !== i) continue;
      if (visible(out[i], isMediaElement(out[i]))) clean.push(out[i]);
    }
    focusCache = clean;
    focusCacheAt = now;
    return clean;
  }

  function classText(el) {
    var cls = typeof el.className === "string" ? el.className :
      (el.getAttribute ? el.getAttribute("class") || "" : "");
    return cls + " " + (el.id || "");
  }

  function tabLike(el) {
    if (!el || !el.getAttribute) return false;
    if (el.getAttribute("role") === "tab" || el.hasAttribute("data-tab")) return true;
    var marker = classText(el);
    if (/(^|[\s_-])(tab-content|tab-pane|tabpanel)([\s_-]|$)/i.test(marker)) return false;
    if (/(^|[\s_-])(tab|tabs|tab-item|tabitem|tab-button|tabbutton|tab-link|tablink|nav-tab)([\s_-]|$)/i.test(marker)) return true;
    if (el.hasAttribute("aria-controls")) return true;
    var parent = el.parentElement;
    return !!(parent && parent.getAttribute && parent.getAttribute("role") === "tablist");
  }

  function hintAction(el) {
    if (!el || !el.getAttribute || !visible(el)) return false;
    var marker = classText(el);
    if (!HINT_RE.test(marker) || CONTAINER_RE.test(marker)) return false;
    var r = rectOf(el);
    if (r.width < 5 || r.height < 5) return false;
    if (r.width > window.innerWidth * 0.95 && r.height > window.innerHeight * 0.55) return false;
    try {
      if (el.querySelectorAll(SELECTOR).length) return false;
      return el.children.length <= 2;
    } catch (err) {
      return false;
    }
  }

  function hasActionAncestor(el) {
    var p = el.parentElement;
    var depth = 0;
    while (p && p !== document.body && p !== document.documentElement && depth < 8) {
      if (p.matches && (p.matches(SELECTOR) || tabLike(p))) return true;
      var rect = rectOf(p);
      var tooBig = rect.width > window.innerWidth * 0.95 && rect.height > window.innerHeight * 0.55;
      if (!tooBig && (hintAction(p) || hasHandlerProperty(p) || hasReactClick(p) ||
          hasBoundClick(p) || hasJQueryClick(p))) return true;
      try {
        if (!tooBig && window.getComputedStyle(p).cursor === "pointer") return true;
      } catch (err) {}
      p = p.parentElement;
      depth++;
    }
    return false;
  }

  function isClickableNode(el) {
    if (!el || !el.tagName || !el.matches) return false;
    if (el.matches(SELECTOR)) return false;
    var tag = el.tagName.toLowerCase();
    if (!/^(div|span|li|img|svg|picture|figure|section|article|p|strong|b|i|video|canvas)$/.test(tag)) return false;
    var media = isMediaElement(el);
    if (!visible(el, media)) return false;
    var tab = tabLike(el);
    var style = null;
    try { style = window.getComputedStyle(el); } catch (err) {}
    var pointer = !!style && style.cursor === "pointer";
    var background = false;
    if (!media && !pointer && !tab && style && /url\(/i.test(style.backgroundImage || "")) {
      try {
        background = !el.querySelector("img, picture, video, canvas, svg") &&
          el.querySelectorAll(SELECTOR).length === 0;
      } catch (err) { background = false; }
    }
    var custom = false;
    if (!media && !pointer && !tab && !background) {
      custom = hintAction(el) || hasHandlerProperty(el) || hasReactClick(el) ||
        hasBoundClick(el) || hasJQueryClick(el);
    }
    if (!tab && !pointer && !media && !background && !custom) return false;
    var r = rectOf(el);
    var minimum = media || background ? 12 : 5;
    if (r.width < minimum || r.height < minimum) return false;
    if (r.width > window.innerWidth * 0.95 && r.height > window.innerHeight * 0.55) return false;
    // Poster images often have no pointer cursor: the clicking happens on a
    // card wrapper or a React listener. A focusable image inside that wrapper
    // is still a reliable tap target because the click bubbles to the card.
    if (!tab && hasActionAncestor(el)) return false;
    return true;
  }

  function prefersNativeTap(el) {
    return !!(el && el.matches && (isMediaAction(el) || isClickableNode(el) ||
      el.matches("[data-href], [data-url], [data-link], [data-action], " +
        "[data-click], [data-toggle], [data-bs-toggle], [jsaction], [aria-haspopup]")));
  }

  trackClickListeners();

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
    // The side scroller must never move the page. Only vertical scrolling is
    // allowed when focus has nowhere to go, and it is throttled.
    if (dir !== "up" && dir !== "down") return false;
    var now = Date.now();
    if (now - lastFocusScrollAt < 160) return false;
    lastFocusScrollAt = now;
    var x = window.scrollX || window.pageXOffset || 0;
    var y = window.scrollY || window.pageYOffset || 0;
    var stepY = Math.max(120, Math.round(window.innerHeight * 0.35));
    var dy = dir === "up" ? -stepY : stepY;
    try {
      window.scrollTo({ left: x, top: y + dy, behavior: "auto" });
    } catch (err) {
      window.scrollBy(0, dy);
    }
    return true;
  }

  function moveFocus(dir) {
    var region = activeRegion();
    var list = region ? regionFocusables(region) : focusables();
    if (!list.length) return scroll(dir);

    var current = null;
    if (focused && list.indexOf(focused) !== -1) current = focused;
    else if (list.indexOf(document.activeElement) !== -1) current = document.activeElement;
    if (!current) return focusEl(list[0]);

    var r = rectOf(current);
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var best = null;
    var score = Infinity;

    list.forEach(function (el) {
      if (el === current) return;
      var q = rectOf(el);
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

    if (!best) return dir === "up" ? focusTopSidebar() : false;
    return focusEl(best);
  }

  function selectFocus() {
    var region = activeRegion();
    var list = region ? regionFocusables(region) : focusables();
    var el = focused && list.indexOf(focused) !== -1 ? focused : document.activeElement;
    if (list.indexOf(el) === -1) {
      if (!list.length) return false;
      return focusEl(list[0]);
    }
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) {
      focusEl(el);
      var type = (el.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio" || type === "button" ||
          type === "submit" || type === "reset") {
        el.click();
      } else if (type === "file" || type === "range" || type === "color") {
        nativeTap(el);
      } else {
        showSiteKeyboard(el);
      }
      return true;
    }
    if (el.tagName === "SELECT") {
      focusEl(el);
      if (!nativeTap(el)) { try { el.click(); } catch (err) {} }
      return true;
    }
    var before = regions();
    // Poster links, custom cards, icons and tabs often listen on an inner
    // element. Use a real tap at the visible centre, then fall back to the DOM.
    if (!(prefersNativeTap(el) && nativeTap(el))) activateElement(el);
    invalidateFocusables();
    scheduleRegionFocus(before);
    return true;
  }

  function isMediaAction(el) {
    if (!el || !el.querySelector) return false;
    var actionable = el.tagName === "A" || el.tagName === "BUTTON" ||
      el.getAttribute("role") === "button" || el.getAttribute("role") === "link" ||
      el.hasAttribute("onclick");
    return !!actionable && !!el.querySelector("img, picture, video, canvas");
  }

  function showSiteKeyboard(el) {
    if (window.__anystreamKeyboardBridge &&
        typeof window.__anystreamKeyboardBridge.show === "function") {
      try {
        window.__anystreamKeyboardBridge.show();
        return true;
      } catch (err) {}
    }
    // Browser fallback: a real tap on the field is the only way to ask a
    // WebView for the IME without the native bridge.
    return el ? nativeTap(el) : false;
  }

  function nativeTap(el) {
    if (!window.__anystreamPointerBridge ||
        typeof window.__anystreamPointerBridge.clickAt !== "function") return false;
    var r = rectOf(el);
    if (r.width < 2 || r.height < 2) return false;
    try {
      window.__anystreamPointerBridge.clickAt(
        (r.left + r.width / 2) / window.innerWidth,
        (r.top + r.height / 2) / window.innerHeight);
      return true;
    } catch (err) {
      return false;
    }
  }

  function activateElement(target, eventTarget, shouldFocus, clickX, clickY) {
    if (!target) return false;
    if (shouldFocus !== false) {
      try { target.focus({ preventScroll: true }); } catch (err) {}
    }
    var source = eventTarget || target;
    var r = rectOf(target);
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
    style.textContent = "*{-webkit-tap-highlight-color:transparent!important;}" +
      ":focus,:focus-visible{outline:none!important;}";
    (document.head || document.documentElement).appendChild(style);
  }

  function hideSiteScrollbars() {
    if (document.getElementById("__anystream_hidden_scrollbars")) return;
    var style = document.createElement("style");
    style.id = "__anystream_hidden_scrollbars";
    style.textContent = "*{scrollbar-width:none!important;}" +
      "*::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}";
    (document.head || document.documentElement).appendChild(style);
  }

  function drawPointer() {
    ensurePointer();
    pointer.x = Math.max(1, Math.min(window.innerWidth - 2, pointer.x));
    pointer.y = Math.max(1, Math.min(window.innerHeight - 2, pointer.y));
    pointer.overlay.style.left = pointer.x + "px";
    pointer.overlay.style.top = pointer.y + "px";
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

    // Edge scrolling is vertical only and slow. The side scroller never moves
    // the page, while moving the dot to the bottom still lets it go down.
    if ((dir === "down" && pointer.y >= window.innerHeight - 4) ||
        (dir === "up" && pointer.y <= 3)) {
      var now = Date.now();
      if (now - lastPointerScrollAt >= 180) {
        lastPointerScrollAt = now;
        var step = Math.max(24, Math.min(48, Math.round(window.innerHeight * 0.05)));
        try { window.scrollBy(0, dir === "down" ? step : -step); } catch (err) {}
      }
    }
    drawPointer();
    return true;
  }

  function scrollPage(dir) {
    if (dir !== "up" && dir !== "down") return true;
    var now = Date.now();
    if (now - lastFocusScrollAt < 100) return true;
    lastFocusScrollAt = now;
    var y = window.scrollY || window.pageYOffset || 0;
    var step = Math.max(80, Math.round(window.innerHeight * 0.18));
    try {
      window.scrollTo({ left: window.scrollX || window.pageXOffset || 0, top: y + (dir === "up" ? -step : step), behavior: "auto" });
    } catch (err) {
      window.scrollBy(0, dir === "up" ? -step : step);
    }
    return true;
  }

  function showScrollBadge() {
    if (!scrollBadge) {
      scrollBadge = document.createElement("div");
      scrollBadge.id = "__anystream_scroll_mode";
      scrollBadge.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);" +
        "z-index:2147483647;pointer-events:none;color:#fff;background:transparent;" +
        "font:600 13px sans-serif;text-shadow:0 1px 3px #000,0 0 8px #000;";
      scrollBadge.textContent = "SCROLL MODE - hold OK 3s to exit";
      document.documentElement.appendChild(scrollBadge);
    }
    scrollBadge.style.display = "block";
  }

  function toggleScrollMode() {
    scrollMode = !scrollMode;
    if (scrollMode) {
      hidePointer();
      showScrollBadge();
    } else {
      if (scrollBadge) scrollBadge.style.display = "none";
      if (MODE === "pointer") {
        ensurePointer();
        drawPointer();
      }
    }
    return scrollMode;
  }

  function clickPointer() {
    ensurePointer();
    var stack = [];
    try {
      stack = document.elementsFromPoint ? document.elementsFromPoint(pointer.x, pointer.y) : [document.elementFromPoint(pointer.x, pointer.y)];
    } catch (err) {
      stack = [document.elementFromPoint(pointer.x, pointer.y)];
    }
    var exact = stack.length ? stack[0] : null;
    if (!exact || exact === pointer.overlay) return false;
    var hit = null;
    for (var i = 0; i < stack.length; i++) {
      var candidate = stack[i];
      if (!candidate || candidate === pointer.overlay) continue;
      var action = candidate.closest ? candidate.closest(SELECTOR) : null;
      if (action) { hit = action; break; }
    }
    // Prefer the actual DOM control. A native tap can hit a card/overlay first
    // and never reach the hyperlink inside it; native remains the fallback for
    // frames, shadow roots and controls the DOM cannot expose.
    if (!hit) {
      if (window.__anystreamPointerBridge && typeof window.__anystreamPointerBridge.clickAt === "function") {
        try {
          window.__anystreamPointerBridge.clickAt(pointer.x / window.innerWidth, pointer.y / window.innerHeight);
          return true;
        } catch (err) {}
      }
      hit = exact;
    }
    var needsKeyboard = /^(INPUT|TEXTAREA|SELECT)$/.test(hit.tagName) || hit.isContentEditable;
    activateElement(hit, exact, needsKeyboard, pointer.x, pointer.y);
    if (needsKeyboard && hit.tagName !== "SELECT") showSiteKeyboard(hit);
    return true;
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
    cancelRegionFocus();
    if (scrollMode) {
      if (key === "up" || key === "down") return scrollPage(key);
      return true;
    }
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
  window.__anystreamSiteToggleScroll = toggleScrollMode;

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
    invalidateFocusables();
    hideSiteScrollbars();
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
