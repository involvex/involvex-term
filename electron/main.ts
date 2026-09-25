import { app, BrowserWindow, clipboard, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import chokidar, { type FSWatcher } from "chokidar";
import { spawnPty, getPty, killPty, setCwd } from "./ptyManager.js";
import { sniffCwd } from "./cwdTracker.js";
import { getGitStatus, invalidateGitCache } from "./gitEngine.js";
import { getSysStats } from "./sysEngine.js";
import { loadSettings, saveSettings, SETTINGS_FILE } from "./settingsStore.js";
import { buildMenu } from "./hotkeys.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null = null;
let settings = loadSettings();
let sysTimer: NodeJS.Timeout | null = null;
const gitWatchers = new Map<string, FSWatcher>();
let pendingGitRefresh: NodeJS.Timeout | null = null;

async function refreshGitForTab(tabId: string, cwd: string) {
  if (!win) return;
  const status = await getGitStatus(cwd);
  win.webContents.send(`git:changed-${tabId}`, status);
  win.webContents.send("git:changed", { tabId, ...status });
  ensureGitWatcher(tabId, status.repoRoot);
}

function scheduleGitRefresh(tabId: string, cwd: string) {
  if (pendingGitRefresh) clearTimeout(pendingGitRefresh);
  pendingGitRefresh = setTimeout(() => void refreshGitForTab(tabId, cwd), 250);
}

function ensureGitWatcher(tabId: string, repoRoot: string | null) {
  const prev = gitWatchers.get(tabId);
  const prevRoot = (prev as unknown as { __root?: string } | undefined)?.__root;
  if (prev && prevRoot === (repoRoot ?? "")) return;
  if (prev) {
    void prev.close().catch(() => undefined);
    gitWatchers.delete(tabId);
  }
  if (!repoRoot) return;
  try {
    const watcher = chokidar.watch(
      [
        path.join(repoRoot, ".git", "HEAD"),
        path.join(repoRoot, ".git", "index"),
        path.join(repoRoot, ".git", "refs"),
      ],
      {
        ignoreInitial: true,
        depth: 4,
      },
    );
    (watcher as unknown as { __root?: string }).__root = repoRoot;
    watcher.on("all", () => {
      invalidateGitCache(repoRoot);
      const entry = getPty(tabId);
      if (entry) void refreshGitForTab(tabId, entry.cwd);
    });
    gitWatchers.set(tabId, watcher);
  } catch {
    /* watcher optional */
  }
}

function startSysLoop() {
  stopSysLoop();
  const tick = async () => {
    if (!win) return;
    if (!settings.footer.showSys) return;
    try {
      const stats = await getSysStats();
      win.webContents.send("sys:tick", stats);
    } catch {
      /* noop */
    }
  };
  void tick();
  sysTimer = setInterval(
    () => void tick(),
    Math.max(500, settings.footer.refreshMs || 1500),
  );
}

function stopSysLoop() {
  if (sysTimer) clearInterval(sysTimer);
  sysTimer = null;
}

function registerIpc() {
  ipcMain.handle(
    "pty:spawn",
    (
      _e,
      {
        id,
        cwd,
        cols,
        rows,
      }: { id: string; cwd?: string; cols: number; rows: number },
    ) => {
      const entry = spawnPty(id, cwd || os.homedir(), cols, rows);
      entry.pty.onData((data: string) => {
        const cleaned = sniffCwd(id, data, (tabId, newCwd) => {
          setCwd(tabId, newCwd);
          scheduleGitRefresh(tabId, newCwd);
        });
        win?.webContents.send(`pty:data-${id}`, cleaned);
      });
      entry.pty.onExit(() => {
        win?.webContents.send(`pty:exit-${id}`);
      });
      scheduleGitRefresh(id, entry.cwd);
      return { id, cwd: entry.cwd, shell: entry.shell };
    },
  );

  ipcMain.on("pty:write", (_e, { id, data }: { id: string; data: string }) => {
    getPty(id)?.pty.write(data);
  });
  ipcMain.on(
    "pty:resize",
    (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
      try {
        getPty(id)?.pty.resize(Math.max(2, cols), Math.max(1, rows));
      } catch {
        /* noop */
      }
    },
  );
  ipcMain.on("pty:kill", (_e, { id }: { id: string }) => {
    killPty(id);
    const w = gitWatchers.get(id);
    if (w) {
      void w.close().catch(() => undefined);
      gitWatchers.delete(id);
    }
  });
  ipcMain.on("pty:cwd-seed", (_e, { id, cwd }: { id: string; cwd: string }) => {
    setCwd(id, cwd);
    scheduleGitRefresh(id, cwd);
  });

  ipcMain.handle("git:get", async (_e, { cwd }: { cwd: string }) =>
    getGitStatus(cwd),
  );

  ipcMain.handle("sys:get", async () => getSysStats());

  ipcMain.handle("clipboard:write", (_e, { text }: { text: string }) => {
    clipboard.writeText(text ?? "");
  });
  ipcMain.handle("clipboard:read", () => clipboard.readText());

  ipcMain.handle("settings:get", () => settings);
  ipcMain.handle("settings:set", async (_e, next: typeof settings) => {
    settings = saveSettings(next);
    if (win) {
      win.webContents.send("settings:changed", settings);
      await buildMenu(win, settings).catch(() => undefined);
      startSysLoop();
    }
    return settings;
  });
}

function watchSettingsFile() {
  try {
    const w = chokidar.watch(SETTINGS_FILE, { ignoreInitial: true });
    w.on("all", () => {
      try {
        settings = loadSettings();
        win?.webContents.send("settings:changed", settings);
        if (win) void buildMenu(win, settings).catch(() => undefined);
        startSysLoop();
      } catch {
        /* noop */
      }
    });
  } catch {
    /* optional */
  }
}

function createWindow() {
  win = new BrowserWindow({
    title: "involvex-term",
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    backgroundColor: settings.theme.bg || "#1e1e1e",
    webPreferences: { preload: path.join(__dirname, "preload.mjs") },
  });
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(RENDERER_DIST, "index.html"));
  void buildMenu(win, settings).catch(() => undefined);
  startSysLoop();
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

registerIpc();
watchSettingsFile();
app.whenReady().then(createWindow);
