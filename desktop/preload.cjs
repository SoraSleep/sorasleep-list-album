const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("soraDesktop", {
  version: () => ipcRenderer.invoke("app-version"),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  saveUpdateToken: (token) => ipcRenderer.invoke("save-update-token", token),
  pickExportFolder: (currentDir) => ipcRenderer.invoke("pick-export-folder", currentDir),
  beginExport: (name, dir) => ipcRenderer.invoke("begin-export", { name, dir }),
  writeExport: (id, position, data) => ipcRenderer.invoke("write-export", { id, position, data }),
  finishExport: (id) => ipcRenderer.invoke("finish-export", id),
  abortExport: (id) => ipcRenderer.invoke("abort-export", id),
  onUpdate: (cb) => {
    ipcRenderer.on("update-status", (_event, payload) => cb(payload));
  },
});
