import { Menu, Tray, nativeImage } from "electron";
import type { BrowserWindow } from "electron";
import type { AppSettings } from "./settingsStore.js";

let tray: Tray | null = null;

export function destroyTray(): void {
  try {
    tray?.destroy();
  } catch {
    /* noop */
  }
  tray = null;
}

export function setupTray(
  win: BrowserWindow,
  iconPath: string,
  settings: AppSettings,
  onQuit: () => void,
): void {
  if (!settings.tray.enabled) {
    destroyTray();
    return;
  }
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) return;
    if (!tray) {
      tray = new Tray(img.resize({ width: 16, height: 16 }));
      tray.setToolTip("involvex-term");
      tray.on("click", () => {
        if (win.isVisible()) win.focus();
        else {
          win.show();
          win.focus();
        }
      });
    } else {
      tray.setImage(img.resize({ width: 16, height: 16 }));
    }
    const menu = Menu.buildFromTemplate([
      {
        label: win.isVisible() ? "Hide" : "Show",
        click: () => {
          if (win.isVisible()) win.hide();
          else {
            win.show();
            win.focus();
          }
        },
      },
      {
        label: "New Tab",
        click: () => {
          if (!win.isVisible()) win.show();
          win.focus();
          win.webContents.send("tab:action", "new-tab");
        },
      },
      {
        label: "Settings",
        click: () => {
          if (!win.isVisible()) win.show();
          win.focus();
          win.webContents.send("tab:action", "open-settings");
        },
      },
      { type: "separator" },
      { label: "Quit", click: onQuit },
    ]);
    tray.setContextMenu(menu);
  } catch {
    /* tray optional */
  }
}
