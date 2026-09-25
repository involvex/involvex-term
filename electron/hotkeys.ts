import type { BrowserWindow } from "electron";
import type { AppSettings } from "./settingsStore.js";

function accelFromSetting(
  hotkey: string | undefined,
  fallback: string,
): string {
  const h = (hotkey ?? fallback).trim();
  // Electron Menu expects 'CommandOrControl', map Ctrl->CommandOrControl for cross-platform
  return h
    .replace(/Ctrl\+/gi, "CommandOrControl+")
    .replace(/Alt\+/gi, "Alt+")
    .replace(/Shift\+/gi, "Shift+");
}

export function actionForMenuId(menuId: string): string {
  return menuId.replace(/^tab:/, "");
}

export async function buildMenu(
  win: BrowserWindow,
  settings: AppSettings,
): Promise<void> {
  const { Menu } = await import("electron");
  const hk = settings.hotkeys as Record<string, string>;
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Terminal",
      submenu: [
        {
          id: "tab:new",
          label: "New Tab",
          accelerator: accelFromSetting(
            hk["new-tab"],
            "CommandOrControl+Shift+T",
          ),
          click: () => win.webContents.send("tab:action", "new-tab"),
        },
        {
          id: "tab:duplicate",
          label: "Duplicate Tab",
          accelerator: accelFromSetting(
            hk["duplicate-tab"],
            "CommandOrControl+Shift+D",
          ),
          click: () => win.webContents.send("tab:action", "duplicate-tab"),
        },
        {
          id: "tab:close",
          label: "Close Tab",
          accelerator: accelFromSetting(
            hk["close-tab"],
            "CommandOrControl+Shift+W",
          ),
          click: () => win.webContents.send("tab:action", "close-tab"),
        },
        { type: "separator" },
        {
          id: "tab:settings",
          label: "Settings",
          accelerator: accelFromSetting(hk["settings"], "CommandOrControl+,"),
          click: () => win.webContents.send("tab:action", "open-settings"),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          id: "tab:next",
          label: "Next Tab",
          accelerator: accelFromSetting(hk["next-tab"], "CommandOrControl+Tab"),
          click: () => win.webContents.send("tab:action", "next-tab"),
        },
        {
          id: "tab:prev",
          label: "Previous Tab",
          accelerator: accelFromSetting(
            hk["prev-tab"],
            "CommandOrControl+Shift+Tab",
          ),
          click: () => win.webContents.send("tab:action", "prev-tab"),
        },
        { type: "separator" },
        {
          role: "zoomIn",
          accelerator: accelFromSetting(hk["zoom-in"], "CommandOrControl+="),
        },
        {
          role: "zoomOut",
          accelerator: accelFromSetting(hk["zoom-out"], "CommandOrControl+-"),
        },
        {
          role: "resetZoom",
          accelerator: accelFromSetting(hk["zoom-reset"], "CommandOrControl+0"),
        },
        { type: "separator" },
        { role: "toggleDevTools" },
        { role: "togglefullscreen" },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
