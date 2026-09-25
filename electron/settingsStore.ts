import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";

export const SETTINGS_DIR = path.join(os.homedir(), ".involvex-term");
export const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

const ThemeSchema = z.object({
  bg: z.string().default("#1e1e1e"),
  fg: z.string().default("#cccccc"),
  fontFamily: z.string().default("'Cascadia Code', Consolas, monospace"),
  fontSize: z.number().min(8).max(32).default(14),
});

const FooterSchema = z.object({
  showGit: z.boolean().default(true),
  showSys: z.boolean().default(true),
  showCpu: z.boolean().default(true),
  showMem: z.boolean().default(true),
  modulesOrder: z.array(z.string()).default(["git", "sys"]),
  refreshMs: z.number().min(500).max(10000).default(1500),
});

const HotkeysSchema = z.record(z.string(), z.string()).default({
  "new-tab": "Ctrl+Shift+T",
  "close-tab": "Ctrl+Shift+W",
  "next-tab": "Ctrl+Tab",
  "prev-tab": "Ctrl+Shift+Tab",
  "duplicate-tab": "Ctrl+Shift+D",
  settings: "Ctrl+,",
  find: "Ctrl+Shift+F",
  palette: "Ctrl+Shift+P",
  "zoom-in": "Ctrl+=",
  "zoom-out": "Ctrl+-",
  "zoom-reset": "Ctrl+0",
});

const TabsSchema = z.object({
  confirmClose: z.boolean().default(false),
});

const WindowSchema = z.object({
  width: z.number().min(400).max(7680).default(1200),
  height: z.number().min(300).max(4320).default(800),
  x: z.number().int().nullable().default(null),
  y: z.number().int().nullable().default(null),
  maximized: z.boolean().default(false),
});

const TraySchema = z.object({
  enabled: z.boolean().default(true),
  minimizeToTray: z.boolean().default(true),
  closeToTray: z.boolean().default(true),
});

const QuakeSchema = z.object({
  enabled: z.boolean().default(false),
  hotkey: z.string().default("Ctrl+`"),
  heightPercent: z.number().min(20).max(90).default(50),
  hideOnFocusLoss: z.boolean().default(true),
});

export const SettingsSchema = z.object({
  theme: ThemeSchema.default({}),
  footer: FooterSchema.default({}),
  hotkeys: HotkeysSchema.default({}),
  tabs: TabsSchema.default({}),
  window: WindowSchema.default({}),
  tray: TraySchema.default({}),
  quake: QuakeSchema.default({}),
});

export type AppSettings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): AppSettings {
  return SettingsSchema.parse({});
}

function deepMergeDefaults(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    const b = base[k];
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      b &&
      typeof b === "object" &&
      !Array.isArray(b)
    ) {
      // Shallow-merge one nesting level (theme/footer/hotkeys/…), so new
      // default keys (e.g. a new hotkey) reach existing settings files.
      out[k] = { ...(b as object), ...(v as object) };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function loadSettings(): AppSettings {
  try {
    if (!fs.existsSync(SETTINGS_DIR))
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    if (!fs.existsSync(SETTINGS_FILE)) {
      const d = defaultSettings();
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(d, null, 2));
      return d;
    }
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    return SettingsSchema.parse(deepMergeDefaults(defaultSettings(), raw));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(next: AppSettings): AppSettings {
  const parsed = SettingsSchema.parse(next);
  if (!fs.existsSync(SETTINGS_DIR))
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(parsed, null, 2));
  return parsed;
}
