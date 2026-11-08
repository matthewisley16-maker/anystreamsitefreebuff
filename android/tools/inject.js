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

const dpad = tv ? `
<script>
(function () {
  function cards() {
    return Array.prototype.slice.call(document.querySelectorAll(".card"));
  }
  function columns(list) {
    if (!list.length) return 1;
    var top = list[0].offsetTop;
    var count = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].offsetTop === top) count++;
      else break;
    }
    return Math.max(1, count);
  }
  document.addEventListener("keydown", function (event) {
    var el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
    var key = event.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(key) === -1) return;
    var list = cards();
    if (!list.length) return;
    var index = list.indexOf(el);
    if (index === -1) {
      event.preventDefault();
      list[0].focus();
      return;
    }
    var step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : key === "ArrowDown" ? columns(list) : -columns(list);
    var next = index + step;
    if (next >= 0 && next < list.length) {
      event.preventDefault();
      list[next].focus();
    } else if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
    }
  }, true);
  window.addEventListener("load", function () {
    setTimeout(function () {
      var first = document.querySelector(".card");
      if (first) first.focus();
    }, 1200);
  });
})();
</script>` : "";

const css = tv ? `
<style>
  /* 10-foot UI: bigger tiles, focus ring you can see from the sofa. */
  html { --grid-min: 300px; --icon-size: 190px; --icon-img: 178px; --icon-radius: 30px; --icon-font: 78px; --card-pad: 24px; scrollbar-width: none; }
  html[data-layout="minimal"] .grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  html[data-layout="bold"] .grid { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .card:focus, .card:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; transform: translateY(-3px); }
  .btn:focus, .icon-btn-round:focus, .icon-btn:focus, .swatch:focus, .seg:focus { outline: 3px solid var(--accent); outline-offset: 3px; }
  body { overscroll-behavior: none; }
</style>` : `
<style>
  /* Phone: two tiles per row on a normal handset, no tap flash. */
  html { --grid-min: 156px; --icon-size: 92px; --icon-img: 84px; --icon-radius: 18px; --icon-font: 34px; }
  @media (max-width: 480px) { html { --grid-min: 140px; --icon-size: 82px; --icon-img: 74px; } }
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
