import { globalShortcut, screen } from "electron";
import type { BrowserWindow, Rectangle } from "electron";
import type { AppSettings } from "./settingsStore.js";

// Quake-style dropdown: the single main window toggles between its normal
// bounds and a top-docked dropdown on the display containing the cursor.
// One window = one pty set, so tabs/shells survive summoning.

let quakeActive = false;
let returnState: {
  bounds: Rectangle;
  maximized: boolean;
  visible: boolean;
} | null = null;
let registeredAccel: string | null = null;

export function isQuakeActive(): boolean {
  return quakeActive;
}

function toAccel(hotkey: string): string {
  return hotkey
    .trim()
    .replace(/Ctrl\+/gi, "CommandOrControl+")
    .replace(/Alt\+/gi, "Alt+")
    .replace(/Shift\+/gi, "Shift+");
}

function clampHeight(pct: number): number {
  return Math.min(90, Math.max(20, Math.round(pct) || 50));
}

function applyDropdownGeometry(win: BrowserWindow, heightPct: number): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const height = Math.max(
    200,
    Math.round((area.height * clampHeight(heightPct)) / 100),
  );
  if (win.isMaximized()) win.unmaximize();
  win.setAlwaysOnTop(true);
  win.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true });
  win.setBounds({ x: area.x, y: area.y, width: area.width, height });
}

function enterQuake(win: BrowserWindow, s: AppSettings): void {
  returnState = {
    bounds: { ...win.getBounds() },
    maximized: win.isMaximized(),
    visible: win.isVisible(),
  };
  applyDropdownGeometry(win, s.quake.heightPercent);
  if (!win.isVisible()) win.show();
  win.focus();
  quakeActive = true;
}

function dismissQuake(win: BrowserWindow, hide: boolean): void {
  const ret = returnState;
  quakeActive = false;
  returnState = null;
  try {
    win.setAlwaysOnTop(false);
    win.setVisibleOnAllWorkspaces(false);
  } catch {
    /* noop */
  }
  if (hide || !ret?.visible) {
    try {
      win.hide();
    } catch {
      /* noop */
    }
    return;
  }
  try {
    if (ret.maximized) win.maximize();
    else win.setBounds(ret.bounds);
    if (!win.isVisible()) win.show();
    win.focus();
  } catch {
    /* noop */
  }
}

function toggleQuake(win: BrowserWindow, getSettings: () => AppSettings): void {
  if (quakeActive) dismissQuake(win, false);
  else enterQuake(win, getSettings());
}

export function handleQuakeBlur(
  win: BrowserWindow,
  getSettings: () => AppSettings,
): void {
  if (quakeActive && getSettings().quake.hideOnFocusLoss) {
    dismissQuake(win, true);
  }
}

export function registerQuake(
  win: BrowserWindow,
  getSettings: () => AppSettings,
): void {
  if (registeredAccel) {
    try {
      globalShortcut.unregister(registeredAccel);
    } catch {
      /* noop */
    }
    registeredAccel = null;
  }
  const s = getSettings();
  if (quakeActive) {
    if (!s.quake.enabled) {
      dismissQuake(win, false);
      return;
    }
    // Live-apply geometry tweaks while summoned.
    try {
      applyDropdownGeometry(win, s.quake.heightPercent);
    } catch {
      /* noop */
    }
  }
  if (!s.quake.enabled) return;
  const accel = toAccel(s.quake.hotkey || "Ctrl+`");
  try {
    if (globalShortcut.register(accel, () => toggleQuake(win, getSettings))) {
      registeredAccel = accel;
    } else {
      console.error(`[quake] global shortcut denied or invalid: ${accel}`);
    }
  } catch (e) {
    console.error("[quake] register failed:", e);
  }
}

export function unregisterQuake(): void {
  if (registeredAccel) {
    try {
      globalShortcut.unregister(registeredAccel);
    } catch {
      /* noop */
    }
    registeredAccel = null;
  }
  quakeActive = false;
  returnState = null;
}
