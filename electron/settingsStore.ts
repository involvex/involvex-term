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
  "zoom-in": "Ctrl+=",
  "zoom-out": "Ctrl+-",
  "zoom-reset": "Ctrl+0",
});

const TabsSchema = z.object({
  confirmClose: z.boolean().default(false),
});

export const SettingsSchema = z.object({
  theme: ThemeSchema.default({}),
  footer: FooterSchema.default({}),
  hotkeys: HotkeysSchema.default({}),
  tabs: TabsSchema.default({}),
});

export type AppSettings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): AppSettings {
  return SettingsSchema.parse({});
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
    return SettingsSchema.parse({ ...defaultSettings(), ...raw });
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
