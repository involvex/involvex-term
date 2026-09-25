import type { AppSettings } from "../types";

interface Props {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
}

const HOTKEY_ACTIONS: Array<{ id: string; label: string }> = [
  { id: "new-tab", label: "New tab" },
  { id: "close-tab", label: "Close tab" },
  { id: "next-tab", label: "Next tab" },
  { id: "prev-tab", label: "Previous tab" },
  { id: "duplicate-tab", label: "Duplicate tab" },
  { id: "settings", label: "Open settings" },
  { id: "zoom-in", label: "Zoom in" },
  { id: "zoom-out", label: "Zoom out" },
  { id: "zoom-reset", label: "Zoom reset" },
];

export default function SettingsModal({ settings, onChange, onClose }: Props) {
  const set = (patch: Partial<AppSettings>) =>
    onChange({ ...settings, ...patch });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="modal-header">
          <h2>Settings</h2>
          <span className="footer-dim modal-path">
            ~/.involvex-term/settings.json
          </span>
          <button
            type="button"
            className="tab-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <section>
          <h3>Theme</h3>
          <label>
            Background{" "}
            <input
              type="color"
              value={settings.theme.bg}
              onChange={(e) =>
                set({ theme: { ...settings.theme, bg: e.target.value } })
              }
            />
          </label>
          <label>
            Foreground{" "}
            <input
              type="color"
              value={settings.theme.fg}
              onChange={(e) =>
                set({ theme: { ...settings.theme, fg: e.target.value } })
              }
            />
          </label>
          <label>
            Font size{" "}
            <input
              type="number"
              min={8}
              max={32}
              value={settings.theme.fontSize}
              onChange={(e) =>
                set({
                  theme: {
                    ...settings.theme,
                    fontSize: Number(e.target.value),
                  },
                })
              }
            />
          </label>
          <label className="wide">
            Font family{" "}
            <input
              type="text"
              value={settings.theme.fontFamily}
              onChange={(e) =>
                set({
                  theme: { ...settings.theme, fontFamily: e.target.value },
                })
              }
            />
          </label>
        </section>

        <section>
          <h3>Footer status bar</h3>
          <label>
            <input
              type="checkbox"
              checked={settings.footer.showGit}
              onChange={(e) =>
                set({
                  footer: { ...settings.footer, showGit: e.target.checked },
                })
              }
            />{" "}
            Show Git
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.footer.showSys}
              onChange={(e) =>
                set({
                  footer: { ...settings.footer, showSys: e.target.checked },
                })
              }
            />{" "}
            Show PC stats
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.footer.showCpu}
              onChange={(e) =>
                set({
                  footer: { ...settings.footer, showCpu: e.target.checked },
                })
              }
            />{" "}
            CPU
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.footer.showMem}
              onChange={(e) =>
                set({
                  footer: { ...settings.footer, showMem: e.target.checked },
                })
              }
            />{" "}
            Memory
          </label>
          <label>
            Refresh (ms){" "}
            <input
              type="number"
              min={500}
              max={10000}
              step={250}
              value={settings.footer.refreshMs}
              onChange={(e) =>
                set({
                  footer: {
                    ...settings.footer,
                    refreshMs: Number(e.target.value),
                  },
                })
              }
            />
          </label>
        </section>

        <section>
          <h3>Hotkeys</h3>
          <p className="footer-dim">
            Takes effect on restart of menu (applied live where possible).
            Format: Ctrl+Shift+T
          </p>
          {HOTKEY_ACTIONS.map((a) => (
            <label key={a.id} className="wide">
              {a.label}
              <input
                type="text"
                value={settings.hotkeys[a.id] ?? ""}
                onChange={(e) =>
                  set({
                    hotkeys: { ...settings.hotkeys, [a.id]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </section>

        <section>
          <h3>Tabs</h3>
          <label>
            <input
              type="checkbox"
              checked={settings.tabs.confirmClose}
              onChange={(e) =>
                set({
                  tabs: { ...settings.tabs, confirmClose: e.target.checked },
                })
              }
            />{" "}
            Confirm before closing last tab
          </label>
        </section>

        <section>
          <h3>Window & Tray</h3>
          <label>
            <input
              type="checkbox"
              checked={settings.tray.enabled}
              onChange={(e) =>
                set({ tray: { ...settings.tray, enabled: e.target.checked } })
              }
            />{" "}
            Enable system tray icon
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.tray.minimizeToTray}
              onChange={(e) =>
                set({
                  tray: { ...settings.tray, minimizeToTray: e.target.checked },
                })
              }
            />{" "}
            Minimize to tray
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.tray.closeToTray}
              onChange={(e) =>
                set({
                  tray: { ...settings.tray, closeToTray: e.target.checked },
                })
              }
            />{" "}
            Close button hides to tray (quit via tray menu)
          </label>
          <p className="footer-dim">
            Window size & position restore automatically on launch.
          </p>
        </section>
      </div>
    </div>
  );
}
