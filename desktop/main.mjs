import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import electronUpdater from "electron-updater";
import { createReadStream, readFileSync } from "node:fs";
import { open, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { autoUpdater } = electronUpdater;
const here = path.dirname(fileURLToPath(import.meta.url));
const windowIcon = path.join(here, "..", "build", "icon.png");
const REPO = { provider: "github", owner: "SoraSleep", repo: "sorasleep-list-album", private: true };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

function tokenPath() {
  return path.join(app.getPath("userData"), "gh-token.txt");
}

function readGithubToken() {
  try {
    return (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim() || readFileSync(tokenPath(), "utf8").trim();
  } catch {
    return "";
  }
}

function feed() {
  const token = readGithubToken();
  return { ...REPO, token: token || undefined };
}

async function findWebRoot() {
  const candidates = [
    path.join(process.resourcesPath || "", "web"),
    path.join(here, "web"),
    path.join(here, "..", "desktop", "web"),
  ];
  for (const dir of candidates) {
    try {
      const st = await stat(path.join(dir, "index.html"));
      if (st.isFile()) return dir;
    } catch {
      /* next */
    }
  }
  return null;
}

function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0] || "/");
      if (urlPath === "/") urlPath = "/index.html";
      const safeRoot = path.resolve(root);
      const file = path.resolve(path.join(safeRoot, urlPath));
      if (!file.startsWith(safeRoot)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      const send = (target, code = 200) => {
        res.statusCode = code;
        res.setHeader("content-type", MIME[path.extname(target).toLowerCase()] || "application/octet-stream");
        createReadStream(target).pipe(res);
      };
      try {
        const st = await stat(file);
        if (st.isFile()) {
          send(file);
          return;
        }
      } catch {
        /* fallback */
      }
      try {
        send(path.join(safeRoot, "index.html"));
      } catch {
        res.statusCode = 404;
        res.end("SoraSleep List: missing index.html");
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("server bind failed"));
        return;
      }
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

async function createWindow(url) {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0a0a0b",
    icon: windowIcon,
    title: "SoraSleep List",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: true,
    },
  });
  win.webContents.setBackgroundThrottling(false);
  win.once("ready-to-show", () => win.show());
  await win.loadURL(url);
  return win;
}

const writes = new Map();
let writeSeq = 0;

ipcMain.handle("pick-export-folder", async (event, currentDir) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(win ?? undefined, {
    title: "Chọn thư mục xuất video",
    defaultPath: currentDir ? String(currentDir) : undefined,
    properties: ["openDirectory", "createDirectory"],
  });
  if (picked.canceled || !picked.filePaths?.[0]) return null;
  return picked.filePaths[0];
});

ipcMain.handle("begin-export", async (_event, payload) => {
  const dir = String(payload?.dir || "");
  const name = path.basename(String(payload?.name || "playlist-youtube.webm"));
  if (!dir || !name) throw new Error("missing export path");
  const file = path.join(dir, name);
  const fh = await open(file, "w");
  const id = String(++writeSeq);
  writes.set(id, { fh, file });
  return id;
});

ipcMain.handle("write-export", async (_event, payload) => {
  const row = writes.get(String(payload?.id || ""));
  if (!row) throw new Error("export closed");
  const data = Buffer.from(payload.data);
  await row.fh.write(data, 0, data.length, Number(payload.position) || 0);
});

ipcMain.handle("finish-export", async (_event, id) => {
  const row = writes.get(String(id || ""));
  if (!row) return;
  writes.delete(String(id));
  await row.fh.close();
});

ipcMain.handle("abort-export", async (_event, id) => {
  const row = writes.get(String(id || ""));
  if (!row) return;
  writes.delete(String(id));
  await row.fh.close().catch(() => undefined);
  await rm(row.file, { force: true }).catch(() => undefined);
});

ipcMain.handle("app-version", () => app.getVersion());

ipcMain.handle("save-update-token", async (_event, token) => {
  const value = String(token || "").trim();
  if (!value) {
    await rm(tokenPath(), { force: true }).catch(() => undefined);
    return false;
  }
  await writeFile(tokenPath(), value, "utf8");
  return true;
});

ipcMain.handle("check-update", async () => {
  if (!app.isPackaged) return { ok: false, reason: "dev", version: app.getVersion() };
  try {
    autoUpdater.setFeedURL(feed());
    const result = await autoUpdater.checkForUpdates();
    return {
      ok: true,
      version: app.getVersion(),
      latest: result?.updateInfo?.version ?? app.getVersion(),
      needToken: !readGithubToken(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "update-failed";
    const needToken = /401|403|404|private|bad credentials|rate limit/i.test(msg);
    return { ok: false, reason: needToken ? "private-token" : msg, version: app.getVersion() };
  }
});

function setupUpdates() {
  if (!app.isPackaged) return;
  try {
    autoUpdater.setFeedURL(feed());
  } catch {
    /* ignore */
  }
  autoUpdater.autoDownload = Boolean(readGithubToken());
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (info) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("update-status", { state: "available", version: info.version });
  });
  autoUpdater.on("update-downloaded", (info) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "SoraSleep List",
        message: `Đã tải bản ${info.version}`,
        detail: "Cài đặt ngay? App sẽ khởi động lại.",
        buttons: ["Cài ngay", "Để sau"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      })
      .catch(() => undefined);
  });
  autoUpdater.checkForUpdates().catch(() => undefined);
}

app.setName("SoraSleep List");
app.setAppUserModelId("com.sorasleep.list");
const locked = app.requestSingleInstanceLock();
let mainWindow = null;

if (!locked) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(async () => {
    setupUpdates();
    const packed = app.isPackaged || process.argv.includes("--prod") || process.env.ELECTRON_PROD === "1";
    let url = process.env.APP_URL || "";
    if (!packed && !url) url = "http://127.0.0.1:8080";
    if (!url) {
      const root = await findWebRoot();
      url = root ? await startStaticServer(root) : "http://127.0.0.1:8080";
    }
    mainWindow = await createWindow(url);
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) shell.beep();
  });
}
