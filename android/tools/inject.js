// Copies the desktop UI into the APK's assets and adds the two things the
// wrapper needs: a bridge that turns Electron calls into native calls, and a
// handful of rules so the same page feels native on a phone or a TV.
const fs = require("fs");

const [src, dest, variant] = process.argv.slice(2);
if (!src || !dest || !variant) {
  console.error("usage: inject.js <index.html> <out.html> <phone|tv>");
  process.exit(1);
}
const tv = variant === "tv";

const shim = `
<script>
(function () {
  if (!window.AndroidShell) return;
  var closed = null;
  // The page thinks it is talking to the Electron shell; these calls land in
  // the Android bridge instead, so the library code stays identical.
  window.anystreamElectron = {
    isElectron: true,
    openSite: function (url) { AndroidShell.openSite(url, ""); return Promise.resolve(true); },
    closeSite: function () { return Promise.resolve(true); },
    reloadSite: function () { return Promise.resolve(true); },
    goBack: function () { return Promise.resolve(true); },
    goForward: function () { return Promise.resolve(true); },
    setChromeHidden: function () { return Promise.resolve(0); },
    clearCache: function () { AndroidShell.clearCache(); return Promise.resolve({ ok: true }); },
    clearCookies: function () { AndroidShell.clearCookies(); return Promise.resolve({ ok: true }); },
    onSiteState: function () {},
    onSiteClosed: function (cb) { closed = cb; }
  };
  window.__anystreamSiteClosed = function () { if (closed) closed(); };
})();
</script>`;

/*
 * D-pad navigation. Two modes:
 *  - library: move between tiles by geometry, so it also works across rows
 *    and category sections instead of assuming one flat grid;
 *  - modal open: walk the panel's own controls in order, so arrows can reach
 *    Settings and the Add-site form instead of jumping to a tile behind it.
 */
const dpad = tv ? `
<script>
(function () {
  var focusedEl = null;
  function shown(el) {
    if (!el || el.hidden) return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }
  function cards() {
    return Array.prototype.slice.call(document.querySelectorAll(".card")).filter(shown);
  }
  function navTargets() {
    return Array.prototype.slice.call(
      document.querySelectorAll("#quickUrl, #quickForm button, .card, .empty .btn, #settingsBtn, #addBtn, #search")
    ).filter(shown);
  }
  function openPanel() {
    var open = Array.prototype.slice.call(document.querySelectorAll(".backdrop")).filter(function (el) {
      return !el.hidden;
    });
    return open.length ? open[open.length - 1].querySelector(".panel") : null;
  }
  function panelItems(panel) {
    return Array.prototype.slice.call(panel.querySelectorAll("button, input, select, [tabindex='0']")).filter(function (el) {
      return !el.disabled && el.getAttribute("aria-disabled") !== "true" && shown(el);
    });
  }
  function focusEl(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); }
    if (!el.classList) return;
    if (focusedEl && focusedEl !== el) focusedEl.classList.remove("tv-focused");
    focusedEl = el;
    el.classList.add("tv-focused");
  }
  function inList(el, list) {
    return !!el && document.documentElement.contains(el) && list.indexOf(el) !== -1;
  }
  function currentIn(list) {
    if (inList(document.activeElement, list)) return document.activeElement;
    if (inList(focusedEl, list)) return focusedEl;
    return document.activeElement;
  }
  function reveal(el) {
    try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (err) {}
  }
  function focusFirst() {
    var panel = openPanel();
    if (panel) {
      var items = panelItems(panel);
      if (items.length) { focusEl(items[0]); reveal(items[0]); return true; }
    }
    var first = cards()[0];
    if (first) { focusEl(first); reveal(first); return true; }
    var emptyAction = document.querySelector(".empty .btn");
    if (emptyAction) { focusEl(emptyAction); reveal(emptyAction); return true; }
    var fallback = document.querySelector(".empty .btn, #settingsBtn, #addBtn, #search");
    if (fallback) { focusEl(fallback); return true; }
    return false;
  }
  function moveCard(dir) {
    var list = navTargets();
    if (!list.length) return focusFirst();
    var current = currentIn(list);
    if (list.indexOf(current) === -1) {
      focusedEl = null;
      return focusFirst();
    }
    // Entering the hero from the top bar should land on the URL field, not
    // the adjacent submit button. The button remains reachable with Right.
    var quickUrl = document.getElementById("quickUrl");
    var navBar = document.getElementById("nav");
    if (dir === "down" && quickUrl && navBar && navBar.contains(current) && shown(quickUrl)) {
      focusEl(quickUrl);
      reveal(quickUrl);
      return true;
    }
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
      var main, cross;
      if (dir === "right") { if (dx < 4) return; main = dx; cross = Math.abs(dy); }
      else if (dir === "left") { if (dx > -4) return; main = -dx; cross = Math.abs(dy); }
      else if (dir === "down") { if (dy < 4) return; main = dy; cross = Math.abs(dx); }
      else { if (dy > -4) return; main = -dy; cross = Math.abs(dx); }
      var next = main + cross * 3;
      if (next < score) { score = next; best = el; }
    });
    if (!best) return false;
    focusEl(best);
    reveal(best);
    return true;
  }
  function movePanel(panel, dir) {
    var items = panelItems(panel);
    if (!items.length) return false;
    var index = items.indexOf(currentIn(items));
    if (index === -1) { focusedEl = null; focusEl(items[0]); reveal(items[0]); return true; }
    var step = dir === "down" || dir === "right" ? 1 : -1;
    var next = Math.min(items.length - 1, Math.max(0, index + step));
    if (next === index) return false;
    focusEl(items[next]);
    reveal(items[next]);
    return true;
  }
  function activate() {
    var panel = openPanel();
    var el = document.activeElement;
    if (panel) {
      var items = panelItems(panel);
      if (!inList(el, items) && inList(focusedEl, items)) el = focusedEl;
      if (!inList(el, items)) {
        if (items.length) { focusEl(items[0]); reveal(items[0]); return true; }
        return false;
      }
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        focusEl(el);
        if (el.type === "checkbox" || el.type === "radio") el.click();
        else if (window.AndroidShell && AndroidShell.showKeyboard) {
          try { AndroidShell.showKeyboard(); } catch (err) {}
        }
        return true;
      }
      el.click();
      var opened = openPanel();
      if (opened && el.tagName !== "SELECT") {
        var controls = panelItems(opened);
        if (controls.length && controls.indexOf(document.activeElement) === -1) {
          focusEl(controls[0]);
          reveal(controls[0]);
        }
      }
      return true;
    }
    var targets = navTargets();
    if (!inList(el, targets) && inList(focusedEl, targets)) el = focusedEl;
    if (!el || !document.documentElement.contains(el)) return focusFirst();
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      focusEl(el);
      if (window.AndroidShell && AndroidShell.showKeyboard) {
        try { AndroidShell.showKeyboard(); } catch (err) {}
      }
      return true;
    }
    if (el.classList && el.classList.contains("card")) { el.click(); return true; }
    if (el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "INPUT" || el.getAttribute("role") === "button") {
      el.click();
      var nextPanel = openPanel();
      if (nextPanel && el.tagName !== "SELECT") {
        var nextControls = panelItems(nextPanel);
        if (nextControls.length && nextControls.indexOf(document.activeElement) === -1) {
          var nextTarget = nextControls[0];
          setTimeout(function () {
            if (openPanel() === nextPanel) { focusEl(nextTarget); reveal(nextTarget); }
          }, 0);
        }
      }
      return true;
    }
    return focusFirst();
  }
  function handleKey(key) {
    if (key === "select") return activate();
    if (key !== "left" && key !== "right" && key !== "up" && key !== "down") return false;
    var panel = openPanel();
    return panel ? movePanel(panel, key) : moveCard(key);
  }
  window.__anystreamTvKey = handleKey;
  window.__anystreamTvFocus = focusFirst;
  document.addEventListener("focusin", function (event) {
    var el = event.target;
    if (!el || !el.classList || el === focusedEl || el === document.body) return;
    if (focusedEl) focusedEl.classList.remove("tv-focused");
    focusedEl = el;
    el.classList.add("tv-focused");
  }, true);

  // The library is rendered after the page script starts. If the initial
  // focus call lands on the top bar before the cards exist, move to the first
  // card as soon as the library appears (and after adding a first site).
  function watchLibrary() {
    if (!document.body || !window.MutationObserver) return;
    var hadCards = cards().length > 0;
    new MutationObserver(function () {
      var nowCards = cards().length;
      if (nowCards > 0 && !hadCards && !openPanel()) {
        var active = document.activeElement;
        if (!active || active.tagName !== "INPUT") focusFirst();
      }
      hadCards = nowCards > 0;
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) watchLibrary();
  else document.addEventListener("DOMContentLoaded", watchLibrary);
  document.addEventListener("keydown", function (event) {
    // Native mode sends keys through __anystreamTvKey; this listener is the
    // fallback for browsers and emulators that deliver keys to the DOM.
    if (window.__anystreamNativeKeys) return;
    var code = event.keyCode;
    var key = event.key === "ArrowLeft" || code === 37 ? "left"
      : event.key === "ArrowRight" || code === 39 ? "right"
      : event.key === "ArrowDown" || code === 40 ? "down"
      : event.key === "ArrowUp" || code === 38 ? "up"
      : event.key === "Enter" || event.key === " " || code === 13 || code === 23 || code === 66 ? "select" : null;
    if (!key) return;
    if (handleKey(key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  window.addEventListener("load", function () {
    setTimeout(function () {
      if (window.__anystreamTvFocus) window.__anystreamTvFocus();
    }, 2800);
  });
})();
</script>` : "";

const css = tv ? `
<style>
  /* 10-foot UI. The desktop page is built for a tall mouse-driven window;
     on a 720p/1080p panel its hero filled the screen and the fixed tile
     sizes were oversized. These rules keep the first rows visible, scale
     everything from the viewport so it fits any TV, and remove the blur
     layers that make a TV box's WebView stutter. */
  html:root,
  html[data-size="sm"],
  html[data-size="md"],
  html[data-size="lg"] {
    --grid-min: clamp(128px, 16.5vh, 320px);
    --card-pad: 0px;
    --page-pad: clamp(30px, min(4vw, 6vh), 120px);
    --tv-gap: clamp(12px, 1vw, 20px);
    --tv-nav: clamp(64px, 8vh, 112px);
  }

  html { scrollbar-width: none; }
  body { overscroll-behavior: none; }
  ::-webkit-scrollbar { width: 0; height: 0; }

  /* No backdrop blur or animated blur on TV GPUs. */
  .nav, .nav.scrolled, .quick, .backdrop {
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }
  .nav, .nav.scrolled { background: rgba(0, 0, 0, 0.94); border-bottom-color: var(--line); }
  .nav { transition: none; }
  .hero::before { filter: none; opacity: 0.75; }
  .card, .card:hover, .card:focus, .card:focus-visible { transition: none; }
  .card:hover { transform: none; box-shadow: none; }
  .grid.entering .card { animation: none; }
  .launch-ring { display: none; }
  .toast { transition: none; }

  /* Paint the page once, behind the splash, instead of staggering everything. */
  .nav, .library, .foot, .hero > * { animation: none !important; opacity: 1 !important; }

  /* ---- top bar ------------------------------------------------------- */
  .nav {
    height: var(--tv-nav);
    gap: clamp(10px, 1vw, 18px);
    padding-right: var(--page-pad);
  }
  body.electron .nav { padding-right: var(--page-pad); -webkit-app-region: no-drag; }
  .logo { font-size: clamp(14px, 1vw, 19px); gap: 8px; }
  .logo-mark { width: clamp(26px, 1.9vw, 36px); height: clamp(26px, 1.9vw, 36px); }
  .logo-mark svg { width: clamp(12px, 0.95vw, 17px); height: clamp(12px, 0.95vw, 17px); }
  .search input { width: clamp(150px, 14vw, 240px); font-size: clamp(13px, 0.85vw, 16px); }
  .search input:focus { width: clamp(180px, 17vw, 280px); }
  .icon-btn-round { width: clamp(38px, 2.6vw, 48px); height: clamp(38px, 2.6vw, 48px); }
  .btn { font-size: clamp(13px, 0.85vw, 16px); padding: 10px 16px; }
  .btn:focus, .icon-btn-round:focus, .icon-btn:focus, .swatch:focus, .seg:focus {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
  }

  /* ---- compact hero -------------------------------------------------- */
  .hero {
    padding: calc(var(--tv-nav) + clamp(12px, 2vh, 22px)) var(--page-pad) clamp(12px, 2vh, 22px);
  }
  .eyebrow, .hero p.lede, .hero-meta { display: none; }
  .hero h1 {
    max-width: none;
    font-size: clamp(24px, min(2.6vw, 4.2vh), 56px);
    line-height: 1.06;
  }
  .quick {
    margin-top: clamp(10px, 1.6vh, 18px);
    max-width: min(620px, 76vw);
    padding: 5px;
  }
  .quick input { font-size: clamp(13px, 0.9vw, 16px); padding: 9px 12px; }

  /* ---- library ------------------------------------------------------- */
  .library { padding: 0 var(--page-pad) clamp(48px, 7vh, 90px); gap: clamp(18px, 3vh, 34px); }
  .row-head { margin-bottom: clamp(8px, 1.2vh, 14px); }
  .row-head h2 { font-size: clamp(14px, 1.05vw, 20px); }
  .row-count { font-size: clamp(11px, 0.8vw, 15px); }
  .grid { gap: var(--tv-gap); }
  .card { border-radius: clamp(8px, 0.55vw, 12px); }
  .card:focus, .card:focus-visible {
    outline: 4px solid var(--accent);
    outline-offset: 3px;
    transform: none;
    box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.35);
  }
  /* Programmatic focus from a TV remote does not always match :focus-visible,
     so the selected element also gets an explicit class. */
  .tv-focused {
    outline: 3px solid var(--accent) !important;
    outline-offset: 3px !important;
  }
  .card.tv-focused {
    outline-width: 4px !important;
    transform: none;
    box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.35);
  }
  .card .site-monogram { font-size: clamp(34px, 4vw, 64px); }
  .card-body { padding: clamp(28px, 2.2vw, 40px) clamp(10px, 0.8vw, 16px) clamp(10px, 0.8vw, 16px); }
  .card-name { font-size: clamp(13px, min(1.05vw, 1.7vh), 26px); }
  .card-actions { top: 6px; right: 6px; }
  .icon-btn { width: clamp(26px, 2vw, 36px); height: clamp(26px, 2vw, 36px); }

  /* ---- panels -------------------------------------------------------- */
  .backdrop { padding: clamp(24px, 5vh, 60px); background: rgba(0, 0, 0, 0.88); }
  .panel {
    width: min(720px, 84vw);
    max-height: 88vh;
    padding: clamp(20px, 2vw, 32px);
    animation: none;
  }
  .settings-panel { width: min(760px, 86vw); }
  .panel h2 { font-size: clamp(20px, 1.6vw, 28px); }
  .panel .hint { font-size: clamp(13px, 0.95vw, 16px); margin-bottom: clamp(14px, 2vh, 22px); }
  .settings-section { padding: clamp(10px, 1.4vh, 16px) 0; }
  .settings-section h3 { font-size: clamp(10px, 0.8vw, 13px); }
  .field { margin-bottom: clamp(12px, 1.6vh, 18px); }
  .field label { font-size: clamp(10px, 0.8vw, 13px); }
  .field input, .field select { font-size: clamp(14px, 1vw, 18px); padding: clamp(10px, 1.2vh, 14px) 14px; }
  .field .sub { font-size: clamp(11px, 0.85vw, 14px); }
  .seg { font-size: clamp(12px, 0.9vw, 16px); padding: clamp(8px, 1vh, 12px) 10px; }
  .swatch { width: clamp(40px, 3vw, 56px); height: clamp(40px, 3vw, 56px); }
  .settings-row p { font-size: clamp(13px, 0.95vw, 16px); }
  .row-note { font-size: clamp(11px, 0.85vw, 14px); }
  .panel-actions .btn { padding: 12px 20px; }
  .welcome-panel { width: min(560px, 82vw); }
  .welcome-mark { width: 64px; height: 64px; }
  .welcome-panel h2 { font-size: clamp(22px, 1.8vw, 30px); }
  .welcome-panel p { font-size: clamp(14px, 1vw, 17px); }
  .welcome-actions .btn { padding: 14px 18px; }

  /* ---- splash: logo + sound still start together, without the blur ---- */
  .splash::before { animation: none; opacity: 0.4; }
  .splash::after { background: none; }
  .splash-word span {
    filter: none;
    transform: none;
    animation: tvFadeIn 0.3s ease both;
    animation-delay: calc(var(--i) * 20ms);
  }
  .splash-word::after { display: none; }
  .splash-rule { animation: none; transform: scaleX(1); }
  .splash-tag { animation: none; opacity: 1; }
  @keyframes tvFadeIn { from { opacity: 0; } to { opacity: 1; } }

  @media (max-width: 900px), (max-height: 620px) {
    .search { display: none; }
    .hero h1 { font-size: clamp(22px, 3.4vw, 32px); }
    .quick { max-width: 86vw; }
  }
</style>` : `
<style>
  /* Phone: two tiles per row on a normal handset, no tap flash. */
  html:root { --grid-min: 156px; }
  @media (max-width: 480px) { html:root { --grid-min: 140px; } }
  body { -webkit-tap-highlight-color: transparent; overscroll-behavior-y: none; }
  .card { -webkit-user-select: none; user-select: none; }
</style>`;

let html = fs.readFileSync(src, "utf8");
if (html.indexOf("</head>") === -1) {
  console.error("index.html has no </head>");
  process.exit(1);
}
html = html.replace("</head>", css + shim + dpad + "\n</head>");
fs.writeFileSync(dest, html);
console.log("injected " + variant + " -> " + html.length + " bytes");
