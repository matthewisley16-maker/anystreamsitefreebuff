// Exposes a tiny, explicit bridge to the library UI. No Node access leaks
// into the renderer — only these calls plus two listeners.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("anystreamElectron", {
  isElectron: true,
  openSite: function (url) { return ipcRenderer.invoke("site:open", url); },
  closeSite: function () { return ipcRenderer.invoke("site:close"); },
  reloadSite: function () { return ipcRenderer.invoke("site:reload"); },
  goBack: function () { return ipcRenderer.invoke("site:back"); },
  goForward: function () { return ipcRenderer.invoke("site:forward"); },
  setChromeHidden: function (hidden) { return ipcRenderer.invoke("site:chrome", !!hidden); },
  onSiteState: function (callback) {
    ipcRenderer.on("site:state", function (_event, state) { callback(state); });
  },
  onSiteClosed: function (callback) {
    ipcRenderer.on("site:closed", function () { callback(); });
  }
});
