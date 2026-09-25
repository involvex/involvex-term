import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { termApi } from "../types";

interface Props {
  tabId: string;
  active: boolean;
  fontFamily: string;
  fontSize: number;
  bg: string;
  fg: string;
  initialCwd?: string;
}

export default function TerminalView({
  tabId,
  active,
  fontFamily,
  fontSize,
  bg,
  fg,
  initialCwd,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const api = termApi();
    const term = new Terminal({
      theme: {
        background: bg,
        foreground: fg,
        cursor: fg,
        selectionBackground: "#264f78",
      },
      fontFamily,
      fontSize,
      cursorBlink: true,
      allowTransparency: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(el);
    termRef.current = term;
    fitRef.current = fit;

    const copySelection = (): boolean => {
      const sel = term.getSelection();
      if (!sel) return false;
      if (api) void api.clipboardWrite(sel).catch(() => undefined);
      else void navigator.clipboard?.writeText(sel).catch(() => undefined);
      term.clearSelection();
      term.focus();
      return true;
    };
    const pasteClipboard = (): void => {
      term.focus();
      if (api) {
        void api
          .clipboardRead()
          .then((text) => {
            if (text) api.ptyWrite(tabId, text);
          })
          .catch(() => undefined);
      } else {
        void navigator.clipboard
          ?.readText()
          .then((text) => {
            if (text) term.paste(text);
          })
          .catch(() => undefined);
      }
    };

    // Windows-Terminal style: Ctrl+C copies ONLY when text is selected
    // (otherwise ^C still interrupts the shell), Ctrl+V pastes.
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      const key = ev.key.toLowerCase();
      if (ev.ctrlKey && ev.shiftKey && key === "c") {
        copySelection();
        return false;
      }
      if (ev.ctrlKey && ev.shiftKey && key === "v") {
        pasteClipboard();
        return false;
      }
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && key === "c") {
        if (term.hasSelection()) {
          copySelection();
          return false;
        }
        return true; // no selection → send ^C to the shell
      }
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && key === "v") {
        pasteClipboard();
        return false;
      }
      if (ev.key === "Insert") {
        if (ev.shiftKey) pasteClipboard();
        else copySelection();
        return false;
      }
      return true;
    });

    // Right-click: copy selection if any, else paste (like Windows Terminal).
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (term.hasSelection()) copySelection();
      else pasteClipboard();
    };
    const onMouseDown = () => term.focus();
    el.addEventListener("contextmenu", onContextMenu);
    el.addEventListener("mousedown", onMouseDown);

    let disposed = false;
    let offData: (() => void) | undefined;
    let offExit: (() => void) | undefined;

    const spawn = async () => {
      if (!api) {
        term.writeln(
          "\x1b[33mNot running in Electron — PTY unavailable.\x1b[0m",
        );
        term.writeln("Run with: bun run dev:electron (vite + electron).");
        return;
      }
      try {
        fit.fit();
        const dims = { cols: term.cols || 80, rows: term.rows || 24 };
        await api.ptySpawn({
          id: tabId,
          cwd: initialCwd,
          cols: dims.cols,
          rows: dims.rows,
        });
        if (initialCwd) api.ptySeedCwd(tabId, initialCwd);
      } catch (e) {
        term.writeln(`\x1b[31mPTY spawn failed: ${String(e)}\x1b[0m`);
        term.writeln("If node-pty is missing, run: bun run rebuild");
        return;
      }
      offData = api.onPtyData(tabId, (data) => term.write(data));
      offExit = api.onPtyExit(tabId, () =>
        term.writeln("\r\n\x1b[90m[process exited]\x1b[0m"),
      );
      term.onData((d) => api.ptyWrite(tabId, d));
    };
    void spawn();

    const ro = new ResizeObserver(() => {
      if (!active) return;
      try {
        fit.fit();
        api?.ptyResize(tabId, term.cols, term.rows);
      } catch {
        /* noop */
      }
    });
    ro.observe(el);

    return () => {
      disposed = true;
      void disposed;
      ro.disconnect();
      el.removeEventListener("contextmenu", onContextMenu);
      el.removeEventListener("mousedown", onMouseDown);
      offData?.();
      offExit?.();
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Apply theme/font live
  useEffect(() => {
    const t = termRef.current;
    if (t) {
      t.options.theme = {
        background: bg,
        foreground: fg,
        cursor: fg,
        selectionBackground: "#264f78",
      };
      t.options.fontFamily = fontFamily;
      t.options.fontSize = fontSize;
      try {
        fitRef.current?.fit();
        termApi()?.ptyResize(tabId, t.cols, t.rows);
      } catch {
        /* noop */
      }
    }
  }, [bg, fg, fontFamily, fontSize, tabId]);

  // Refit when becoming active
  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
        const t = termRef.current;
        if (t) termApi()?.ptyResize(tabId, t.cols, t.rows);
        termRef.current?.focus();
      } catch {
        /* noop */
      }
    });
  }, [active, tabId]);

  return (
    <div
      ref={containerRef}
      style={{
        display: active ? "block" : "none",
        width: "100%",
        height: "100%",
        background: bg,
      }}
    />
  );
}
