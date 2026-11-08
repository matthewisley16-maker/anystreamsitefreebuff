// anystreamsite — Electron shell.
// The library UI runs in the main window; streaming sites open in a native
// web view docked below the app's own header, so they feel part of the app.

const path = require("node:path");
const { app, BrowserWindow, WebContentsView, ipcMain, shell, Menu, session } = require("electron");

const APP_ROOT = path.join(__dirname, "..");
// Must match the .nav heights in index.html.
const HEADER_HEIGHT = 68;
const COLLAPSED_HEIGHT = 30;
// Persistent partition: cookies and logins survive a restart.
const SITE_PARTITION = "persist:anystreamsite";

let mainWindow = null;
let siteView = null;
let headerInset = HEADER_HEIGHT;

function layoutSiteView() {
  if (!siteView || !mainWindow) return;
  const [width, height] = mainWindow.getContentSize();
  siteView.setBounds({
    x: 0,
    y: headerInset,
    width,
    height: Math.max(0, height - headerInset)
  });
}

function closeSiteView() {
  if (!siteView) return;
  try {
    if (mainWindow) mainWindow.contentView.removeChildView(siteView);
  } catch (err) { /* view already detached */ }
  try {
    siteView.webContents.close();
  } catch (err) {
    try { siteView.webContents.destroy(); } catch (err2) { /* already gone */ }
  }
  siteView = null;
}

function navigation(wc) {
  try { return wc.navigationHistory || null; } catch (err) { return null; }
}

function canGo(wc, direction) {
  const history = navigation(wc);
  if (!history) return false;
  try {
    return direction === "back" ? history.canGoBack() : history.canGoForward();
  } catch (err) {
    return false;
  }
}

function goHistory(wc, direction) {
  const history = navigation(wc);
  if (!history) return;
  try {
    if (direction === "back" && history.canGoBack()) history.goBack();
    if (direction === "forward" && history.canGoForward()) history.goForward();
  } catch (err) { /* nothing to navigate */ }
}

function sendSiteState() {
  if (!siteView || !mainWindow) return;
  const wc = siteView.webContents;
  mainWindow.webContents.send("site:state", {
    canGoBack: canGo(wc, "back"),
    canGoForward: canGo(wc, "forward"),
    url: wc.getURL()
  });
}

function openSite(url) {
  closeSiteView();

  siteView = new WebContentsView({
    webPreferences: {
      // Persisted partition keeps logins between launches.
      partition: SITE_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.contentView.addChildView(siteView);
  headerInset = HEADER_HEIGHT;
  layoutSiteView();

  var retried = false;
  siteView.webContents.loadURL(url).catch(function () { /* surfaced by the page itself */ });

  // A transient failure (network hiccup, DNS) gets one silent retry instead of
  // showing the user an error screen.
  siteView.webContents.on("did-fail-load", function (_event, errorCode, _desc, failedUrl, isMainFrame) {
    if (!isMainFrame || errorCode === -3 || retried) return;
    retried = true;
    setTimeout(function () {
      if (siteView && failedUrl) siteView.webContents.loadURL(failedUrl).catch(function () {});
    }, 900);
  });

  siteView.webContents.setWindowOpenHandler(function (details) {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  siteView.webContents.on("before-input-event", function (event, input) {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      closeSiteView();
      if (mainWindow) mainWindow.webContents.send("site:closed");
    }
  });

  ["did-navigate", "did-navigate-in-page", "did-start-loading", "did-stop-loading"].forEach(function (name) {
    siteView.webContents.on(name, sendSiteState);
  });
  sendSiteState();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 880,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: "#000000",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0a0a0a",
      symbolColor: "#e9e9e9",
      height: 40
    },
    icon: path.join(APP_ROOT, "anystream.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(APP_ROOT, "index.html"));

  mainWindow.once("ready-to-show", function () { mainWindow.show(); });
  mainWindow.on("resize", layoutSiteView);
  mainWindow.on("closed", function () {
    siteView = null;
    mainWindow = null;
  });

  // Links opened from the library itself go to the real browser.
  mainWindow.webContents.setWindowOpenHandler(function (details) {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
}

ipcMain.handle("site:open", function (_event, url) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  openSite(url);
  return true;
});

ipcMain.handle("site:close", function () {
  closeSiteView();
  // Keep the renderer in sync even if a view goes away by another route.
  if (mainWindow) mainWindow.webContents.send("site:closed");
  return true;
});

ipcMain.handle("site:reload", function () {
  if (siteView) siteView.webContents.reload();
  return true;
});

ipcMain.handle("site:back", function () {
  if (siteView) goHistory(siteView.webContents, "back");
  return true;
});

ipcMain.handle("site:forward", function () {
  if (siteView) goHistory(siteView.webContents, "forward");
  return true;
});

ipcMain.handle("site:chrome", function (_event, hidden) {
  headerInset = hidden ? COLLAPSED_HEIGHT : HEADER_HEIGHT;
  layoutSiteView();
  return headerInset;
});

function siteSession() {
  try {
    return session.fromPartition(SITE_PARTITION);
  } catch (err) {
    return null;
  }
}

// The library's own storage lives in the default session, so both of these only
// touch what the streaming sites kept behind.
ipcMain.handle("data:clear-cache", async function () {
  const ses = siteSession();
  if (!ses) return { ok: false };
  try {
    await ses.clearCache();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

ipcMain.handle("data:clear-cookies", async function () {
  const ses = siteSession();
  if (!ses) return { ok: false };
  try {
    // Sign-in state mostly lives in cookies, but many sites also keep tokens in
    // local storage, IndexedDB or a service worker. Wiping cookies alone would
    // leave the user signed in, so clear everything the sites stored.
    await ses.clearStorageData({
      storages: ["cookies", "localstorage", "indexdb", "websql", "serviceworkers", "cachestorage"]
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

app.whenReady().then(function () {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
