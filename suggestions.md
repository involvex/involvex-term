# Involvex-Term Feature Suggestions

Living backlog (refreshed for **v0.10**). Struck items shipped; keep IDs stable.

## Shipped (do not re-open)

| ID       | Notes                                                         |
| -------- | ------------------------------------------------------------- |
| FEAT-001 | Footer Git fetch / pull / push / stash / stash pop (v0.9.3)   |
| FEAT-002 | Multi-pane search within a tab                                |
| FEAT-003 | Cross-tab pane drag-and-drop                                  |
| FEAT-004 | Lazy pane hydration (xterm/ConPTY on first focus)             |
| FEAT-006 | Import/export profiles independently of full settings (v0.10) |
| FEAT-008 | Recent commands in palette (OSC 633 + app-written; no Ctrl+R) |
| FEAT-009 | Per-profile environment variables (Settings → Shell profiles) |
| FEAT-010 | Read-only Changes list in Git footer (name-status; v0.9.3)    |
| FEAT-011 | Git watcher refresh debounce (250ms in main)                  |
| FEAT-012 | Pane split ratios persisted in session restore                |
| FEAT-014 | Cursor style (block / underline / bar) in Terminal settings   |
| FEAT-015 | Clipboard history ring (Ctrl+Shift+V; persist opt-in; v0.10)  |
| FEAT-024 | Recent directories in new-tab menu + palette (v0.10)          |
| FEAT-025 | Sys stats loop skips when footer sys hidden / window hidden   |
| FEAT-021 | High-contrast theme preset + forced-colors chrome             |

## High Priority

| ID       | Category | Description                                                          | Impact | Effort |
| -------- | -------- | -------------------------------------------------------------------- | ------ | ------ |
| FEAT-005 | Security | Warn before running plugins from untrusted sources (signature check) | Medium | Low    |

## Medium Priority

| ID       | Category      | Description                                                    | Impact | Effort |
| -------- | ------------- | -------------------------------------------------------------- | ------ | ------ |
| FEAT-007 | Accessibility | Text-to-speech readout for background pane completion          | Medium | Low    |
| FEAT-013 | Security      | sandbox plugin filesystem access (restrict to plugin dir only) | Medium | Medium |

## Low Priority

| ID       | Category      | Description                                                    | Impact | Effort |
| -------- | ------------- | -------------------------------------------------------------- | ------ | ------ |
| FEAT-016 | Git workflow  | Git graph mini-view in footer (recent commits)                 | Low    | High   |
| FEAT-017 | Configuration | Custom notification sounds for background pane completion      | Low    | Low    |
| FEAT-018 | Productivity  | Template snippets for common workflows (new project, PR, etc.) | Low    | Low    |
| FEAT-019 | Performance   | Cache git remote URLs to avoid repeated API calls              | Low    | Low    |
| FEAT-020 | UX            | Animated window open/close for quake dropdown                  | Low    | Medium |
| FEAT-022 | Configuration | Per-project auto-start profiles (auto-switch shell per repo)   | Low    | Medium |
| FEAT-023 | Security      | Plugin sandboxing via Node.js vm module                        | Low    | High   |

## Follow-ups from v0.9.2 / v0.10

- Authenticode-sign the sparse Explorer MSIX so Win11 top-level menu works without Developer Mode
- Full inline diff viewer (FEAT-010 was reduced to a name-status list in v0.9.3)
- Commit UI stays out of scope (use the shell)

---

## Analysis Notes

### Codebase Strengths

- Clean separation: renderer (src/), main process (electron/), shared types (src/types.ts)
- Flat pane rendering with stable keys avoids remounting on split changes (src/components/PaneLayout.tsx)
- Backward-compatible zod schemas with prefault defaults (electron/settingsStore.ts)
- Plugin system with isolated loading and error handling (electron/pluginManager.ts)
- Comprehensive OSC7/9;9 cwd tracking with chunk reassembly (electron/cwdTracker.ts)
- Windows Terminal-style copy/paste semantics (Ctrl+C copies only with selection)

### Remaining gaps

- Plugin security is trust-based; no signature/sandboxing (electron/pluginManager.ts)
- No in-app git commit UI (intentional — use the shell)
