import { useCallback, useEffect, useRef, useState } from "react";
import TerminalView from "./components/TerminalView";
import TabBar, { type TabInfo } from "./components/TabBar";
import StatusBar from "./components/StatusBar";
import SettingsModal from "./components/SettingsModal";
import {
  termApi,
  isElectron,
  type GitStatus,
  type SysStats,
  type AppSettings,
} from "./types";
import "./App.css";

const DEFAULT_SETTINGS: AppSettings = {
  theme: {
    bg: "#1e1e1e",
    fg: "#cccccc",
    fontFamily: "'Cascadia Code', Consolas, monospace",
    fontSize: 14,
  },
  footer: {
    showGit: true,
    showSys: true,
    showCpu: true,
    showMem: true,
    modulesOrder: ["git", "sys"],
    refreshMs: 1500,
  },
  hotkeys: {
    "new-tab": "Ctrl+Shift+T",
    "close-tab": "Ctrl+Shift+W",
    "next-tab": "Ctrl+Tab",
    "prev-tab": "Ctrl+Shift+Tab",
    "duplicate-tab": "Ctrl+Shift+D",
    settings: "Ctrl+,",
    "zoom-in": "Ctrl+=",
    "zoom-out": "Ctrl+-",
    "zoom-reset": "Ctrl+0",
  },
  tabs: { confirmClose: false },
  window: { width: 1200, height: 800, x: null, y: null, maximized: false },
  tray: { enabled: true, minimizeToTray: true, closeToTray: true },
};

let tabSeq = 0;
function newTab(cwd?: string): TabInfo {
  tabSeq += 1;
  return { id: `tab-${Date.now()}-${tabSeq}`, title: `Tab ${tabSeq}`, cwd };
}

export default function App() {
  const [tabs, setTabs] = useState<TabInfo[]>(() => [newTab()]);
  const [activeId, setActiveId] = useState<string>(() => "");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [sys, setSys] = useState<SysStats | null>(null);
  const [cwd, setCwd] = useState("");
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  useEffect(() => {
    setActiveId((prev) => prev || tabs[0]?.id || "");
  }, [tabs]);

  // Load settings
  useEffect(() => {
    const api = termApi();
    if (!api) return;
    api
      .settingsGet()
      .then((s) => setSettings({ ...DEFAULT_SETTINGS, ...(s as AppSettings) }))
      .catch(() => undefined);
    const off = api.onSettingsChanged((s) =>
      setSettings({ ...DEFAULT_SETTINGS, ...(s as AppSettings) }),
    );
    return off;
  }, []);

  // Sys stats
  useEffect(() => {
    const api = termApi();
    if (!api) return;
    api
      .sysGet()
      .then((s) => setSys(s as SysStats))
      .catch(() => undefined);
    const off = api.onSysTick((s) => setSys(s as SysStats));
    return off;
  }, []);

  // Git status for active tab: subscribe to per-tab + global events
  useEffect(() => {
    const api = termApi();
    if (!api || !activeId) return;
    const off1 = api.onGitChangedFor(activeId, (st) => {
      setGit(st as GitStatus);
      setCwd((st as GitStatus).cwd || "");
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? {
                ...t,
                cwd: (st as GitStatus).cwd,
                title: shortTitle(
                  (st as GitStatus).cwd,
                  (st as GitStatus).branch,
                ),
              }
            : t,
        ),
      );
    });
    const off2 = api.onGitChanged((msg) => {
      if (msg.tabId !== activeRef.current) return;
      setGit(msg as unknown as GitStatus);
      const g = msg as unknown as GitStatus;
      setCwd(g.cwd || "");
    });
    return () => {
      off1();
      off2();
    };
  }, [activeId]);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length === 1) {
        // Keep at least one tab: kill pty and respawn fresh id
        termApi()?.ptyKill(id);
        const nt = newTab();
        setActiveId(nt.id);
        return [nt];
      }
      termApi()?.ptyKill(id);
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeRef.current) {
        const at = next[Math.max(0, idx - 1)] || next[0];
        if (at) setActiveId(at.id);
      }
      return next;
    });
  }, []);

  const addTab = useCallback(
    (cwdToUse?: string) => {
      const nt = newTab(cwdToUse ?? (git?.cwd || cwd || undefined));
      setTabs((prev) => [...prev, nt]);
      setActiveId(nt.id);
    },
    [git?.cwd, cwd],
  );

  // Menu / hotkey actions from main
  useEffect(() => {
    const api = termApi();
    if (!api) return;
    const off = api.onTabAction((action) => {
      const tabsNow = tabsRef.current;
      const active = activeRef.current;
      const idx = tabsNow.findIndex((t) => t.id === active);
      if (action === "new-tab") addTab();
      else if (action === "close-tab") closeTab(active);
      else if (action === "duplicate-tab") addTab(git?.cwd || cwd || undefined);
      else if (action === "next-tab" && tabsNow.length > 1)
        setActiveId(tabsNow[(idx + 1) % tabsNow.length]?.id || active);
      else if (action === "prev-tab" && tabsNow.length > 1)
        setActiveId(
          tabsNow[(idx - 1 + tabsNow.length) % tabsNow.length]?.id || active,
        );
      else if (action === "open-settings") setShowSettings(true);
    });
    return off;
  }, [addTab, closeTab, git?.cwd, cwd]);

  // Keyboard shortcuts in renderer (works in dev + packaged)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && e.shiftKey && key === "t") {
        e.preventDefault();
        addTab();
      } else if (mod && e.shiftKey && key === "w") {
        e.preventDefault();
        if (activeRef.current) closeTab(activeRef.current);
      } else if (mod && key === "tab") {
        e.preventDefault();
        const ts = tabsRef.current;
        const i = ts.findIndex((t) => t.id === activeRef.current);
        const n = e.shiftKey
          ? (i - 1 + ts.length) % ts.length
          : (i + 1) % ts.length;
        const nt = ts[n];
        if (nt) setActiveId(nt.id);
      } else if (mod && e.shiftKey && key === "d") {
        e.preventDefault();
        addTab(git?.cwd || cwd || undefined);
      } else if (mod && key === ",") {
        e.preventDefault();
        setShowSettings(true);
      } else if (mod && /^[1-9]$/.test(key)) {
        const i = Number(key) - 1;
        const t = tabsRef.current[Math.min(i, tabsRef.current.length - 1)];
        if (t && (key !== "9" || i < 8)) setActiveId(t.id);
        else if (key === "9") {
          const last = tabsRef.current[tabsRef.current.length - 1];
          if (last) setActiveId(last.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addTab, closeTab, git?.cwd, cwd]);

  const saveSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    termApi()
      ?.settingsSet(next)
      .catch(() => undefined);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeId) || tabs[0];

  return (
    <div
      className="app"
      style={{ background: settings.theme.bg, color: settings.theme.fg }}
    >
      <TabBar
        tabs={tabs}
        activeId={activeTab?.id || ""}
        onSelect={setActiveId}
        onClose={closeTab}
        onNew={() => addTab()}
        onOpenSettings={() => setShowSettings(true)}
      />
      <div className="terminals">
        {tabs.map((t) => (
          <TerminalView
            key={t.id}
            tabId={t.id}
            active={t.id === activeTab?.id}
            fontFamily={settings.theme.fontFamily}
            fontSize={settings.theme.fontSize}
            bg={settings.theme.bg}
            fg={settings.theme.fg}
            initialCwd={t.cwd}
          />
        ))}
      </div>
      {!isElectron() && (
        <div className="web-warning">
          Web preview — PTY/Git/Sys need Electron. Run{" "}
          <code>bun run dev:electron</code>.
        </div>
      )}
      <StatusBar git={git} sys={sys} settings={settings} cwd={cwd} />
      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function shortTitle(cwd: string, branch: string): string {
  const base = (cwd || "").split(/[/\\]/).filter(Boolean).pop() || "shell";
  return branch ? `${base} ⎇${branch}` : base;
}
