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
  function shown(el) {
    if (!el || el.offsetParent === null) return false;
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }
  function cards() {
    return Array.prototype.slice.call(document.querySelectorAll(".card")).filter(shown);
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
  function moveCard(dir) {
    var list = cards();
    if (!list.length) {
      var fallback = document.querySelector(".library button, #addBtn, #settingsBtn");
      if (fallback) { fallback.focus(); return true; }
      return false;
    }
    var current = document.activeElement;
    if (list.indexOf(current) === -1) { list[0].focus(); return true; }
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
    best.focus({ preventScroll: true });
    best.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }
  function movePanel(panel, dir) {
    var items = panelItems(panel);
    if (!items.length) return false;
    var index = items.indexOf(document.activeElement);
    if (index === -1) { items[0].focus(); return true; }
    var step = dir === "down" || dir === "right" ? 1 : -1;
    var next = Math.min(items.length - 1, Math.max(0, index + step));
    if (next === index) return false;
    items[next].focus();
    return true;
  }
  document.addEventListener("keydown", function (event) {
    var dir = event.key === "ArrowLeft" ? "left"
      : event.key === "ArrowRight" ? "right"
      : event.key === "ArrowDown" ? "down"
      : event.key === "ArrowUp" ? "up" : null;
    if (!dir) return;
    var el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
    var panel = openPanel();
    if (panel ? movePanel(panel, dir) : moveCard(dir)) event.preventDefault();
  }, true);
  window.addEventListener("load", function () {
    setTimeout(function () {
      if (openPanel()) return;
      var first = document.querySelector(".card");
      if (first) first.focus({ preventScroll: true });
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
