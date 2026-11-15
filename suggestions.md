# Involvex-Term Feature Suggestions

Living backlog (refreshed for **v0.9.x**). Struck items shipped; keep IDs stable.

## Shipped (do not re-open)

| ID       | Notes                                                         |
| -------- | ------------------------------------------------------------- |
| FEAT-002 | Multi-pane search within a tab                                |
| FEAT-003 | Cross-tab pane drag-and-drop                                  |
| FEAT-004 | Lazy pane hydration (xterm/ConPTY on first focus)             |
| FEAT-009 | Per-profile environment variables (Settings → Shell profiles) |
| FEAT-014 | Cursor style (block / underline / bar) in Terminal settings   |

## High Priority

| ID       | Category      | Description                                                               | Impact | Effort |
| -------- | ------------- | ------------------------------------------------------------------------- | ------ | ------ |
| FEAT-001 | Git workflow  | Add git push/pull/fetch/commit/stash actions in the GitWidget footer menu | High   | Medium |
| FEAT-005 | Security      | Warn before running plugins from untrusted sources (signature check)      | Medium | Low    |
| FEAT-006 | Configuration | Import/export profiles independently of full settings                     | Medium | Low    |

## Medium Priority

| ID       | Category      | Description                                                      | Impact | Effort |
| -------- | ------------- | ---------------------------------------------------------------- | ------ | ------ |
| FEAT-007 | Accessibility | Text-to-speech readout for background pane completion            | Medium | Low    |
| FEAT-008 | Productivity  | Command history search (Ctrl+R reverse-i-search style)           | Medium | Medium |
| FEAT-010 | Git workflow  | Inline git diff viewer in status bar menu                        | Medium | Medium |
| FEAT-011 | Performance   | Debounce git watcher file events to avoid excessive refreshes    | Medium | Low    |
| FEAT-012 | UX            | Remember and restore pane split ratios per tab in session        | Medium | Low    |
| FEAT-013 | Security      | sandbox plugin filesystem access (restrict to plugin dir only)   | Medium | Medium |
| FEAT-015 | Productivity  | Clipboard history ring (Ctrl+Shift+V cycle through recent clips) | Medium | Medium |

## Low Priority

| ID       | Category      | Description                                                    | Impact | Effort |
| -------- | ------------- | -------------------------------------------------------------- | ------ | ------ |
| FEAT-016 | Git workflow  | Git graph mini-view in footer (recent commits)                 | Low    | High   |
| FEAT-017 | Configuration | Custom notification sounds for background pane completion      | Low    | Low    |
| FEAT-018 | Productivity  | Template snippets for common workflows (new project, PR, etc.) | Low    | Low    |
| FEAT-019 | Performance   | Cache git remote URLs to avoid repeated API calls              | Low    | Low    |
| FEAT-020 | UX            | Animated window open/close for quake dropdown                  | Low    | Medium |
| FEAT-021 | Accessibility | High-contrast theme preset                                     | Low    | Low    |
| FEAT-022 | Configuration | Per-project auto-start profiles (auto-switch shell per repo)   | Low    | Medium |
| FEAT-023 | Security      | Plugin sandboxing via Node.js vm module                        | Low    | High   |
| FEAT-024 | Productivity  | Quick access to recently used directories in new-tab menu      | Low    | Low    |
| FEAT-025 | Performance   | Reduce sys stats polling when footer is hidden                 | Low    | Low    |

## Follow-ups from v0.9.2

- Authenticode-sign the sparse Explorer MSIX so Win11 top-level menu works without Developer Mode
- Linux/bash live OSC7 cwd (footer Git path honesty outside PowerShell)

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

- No git push/pull/fetch/commit UI beyond checkout (electron/gitEngine.ts)
- Plugin security is trust-based; no signature/sandboxing (electron/pluginManager.ts)
- No clipboard history or shell-side command history UI
