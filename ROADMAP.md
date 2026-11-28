# Roadmap — involvex-term

Living product plan. Positioning: **Windows Terminal parity where it matters**,
plus **Git + OpenCode differentiators** — not a clone of every WT setting.

Track progress by moving items into `CHANGELOG.md` when shipped. Stable backlog
IDs (FEAT-###) live in [`suggestions.md`](suggestions.md); this roadmap groups
them into realistic release phases.

**Verification baseline (2026-11-28, `main` @ 2c0d20a):** `bunx tsc --noEmit`,
`bun run lint`, `bun run format:check`, and `bun test` (285 pass / 0 fail)
all green. Items below were checked against current code seams before being
added.

## Now

- [ ] FEAT-016 (scoped): Recent commits list in Git footer menu

## Later

- [ ] FEAT-028: Read-only inline diff preview from Changes row
- [ ] FEAT-029: Changes row actions (Reveal / Copy path)
- [ ] FEAT-022: Per-project auto-start profile
- [ ] FEAT-018: Built-in snippet templates
- [ ] FEAT-030: Named session layouts
- [ ] FEAT-020: Animated quake dropdown (respect reduced-motion)
- [ ] FEAT-031: Opt-in sync of recent dirs/commands in Gist portable subset
- [ ] FEAT-032: Raise coverage for panes + focusTrap
- [ ] FEAT-033: Windows CI job for `bun run build:electron`
- [ ] Share plugin trust gate: free announcement draft in SHARE.md
- [ ] Share completion speech: free announcement draft in SHARE.md
- [ ] Share completion sound: free announcement draft in SHARE.md
- [ ] Share remote URL cache: free announcement draft in SHARE.md
- [ ] Share plugin API git/prompt: free announcement draft in SHARE.md
- [ ] Share focus-trap tests: free announcement draft in SHARE.md

## Done

- [x] FEAT-027: Focus-trap unit tests + ProcessManager modal audit
- [x] FEAT-026: Plugin API — `api.git.get` + `api.pty.onPrompt`; SDK 0.1.1
- [x] FEAT-019: Cache git remote URL per repo root (TTL + invalidate on action)
- [x] FEAT-017: Custom completion sound file (`terminal.completionSound`)
- [x] FEAT-007: Opt-in spoken readout for background-pane completion
      (`terminal.completionSpeech`, Web Speech API)
- [x] FEAT-005: Plugin trust gate — confirm before first load; persist
      `plugins.trusted` allowlist; Settings → Plugins shows source/errors

## Done / shipping

- Tabs, split panes (horizontal + vertical), find, command palette, session
  restore, tray, quake dropdown
- Git footer: branch/dirty/ahead/behind/stash, fetch/pull/push/stash actions,
  read-only Changes list, live OSC 7 cwd (PowerShell/cmd/WSL/Linux bash+zsh)
- OpenCode: launch/continue, PATH detect, footer status, session picker,
  agent-aware pane/tab labels (busy/idle cue)
- Shell memory: recent dirs MRU, clipboard history ring (`Ctrl+Shift+V`),
  recent commands in palette (app-written + OSC 633), profile import/export
- Settings: zod-validated `~/.involvex-term/settings.json`, Gist sync
  (Device Code, portable subset), startup actions, theme presets, font
  fallback, scrollback/scrollbar, cursor style, footer module order
- Terminal UX: URL/path Ctrl+click, marked prompts/clear buffer, snippets,
  completion toast, lazy pane hydration, buffer flood smoothness, WebGL option
- Distribution: GitHub NSIS/AppImage/portable, in-app updater (non-Store),
  Microsoft Store APPX/MSIX live (`9NBNBH9CJ507`), stable `release/latest`
- Extensibility: local plugin system (opt-in), `@involvex/term-sdk`,
  `@involvex/term` CLI (`sp/nt/upgrade/uninstall/context-menu/doctor`)
- Explorer: classic HKCU context menu; sparse MSIX path for Win11 top-level
  menu (Authenticode needed for zero-friction modern menu)
- CI: lint / tsc / test / format on Ubuntu; release workflow on tags

## v0.11 — Microsoft Store (shipped)

Live at https://apps.microsoft.com/detail/9NBNBH9CJ507

1. ~~Dual-channel Windows: GitHub NSIS + Store APPX/MSIX (`bun run build:store`)~~
2. ~~Store runtime: no GitHub auto-update, safer close-to-tray default, privacy page~~
3. ~~WACK hardening: remove raw `ipcRenderer` bridge, CSP, navigation deny, DevTools gated~~
4. ~~Partner Center first publish + updates via `msstore` (`docs/STORE.md`)~~

## v0.12 — Trust, polish, accessibility

Low-risk items with existing seams. Ship as small PRs; each gets a unit test
where practical.

| ID       | Item                                                                                                                                                    | Why shippable                                                                                                         | Verify                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| FEAT-005 | Plugin trust gate: confirm before first load of an untrusted plugin; show source/error clearly in Settings → Plugins                                    | `electron/pluginManager.ts` already isolates load errors and reports status; add a trust prompt + persisted allowlist | unit: plugin load blocked until trusted; manual: install example plugin |
| FEAT-007 | Opt-in spoken readout for background-pane completion (Web Speech API)                                                                                   | Reuses existing completion toast event in renderer; no native dep                                                     | unit: setting gates call; manual: NVDA/Windows speech sanity            |
| FEAT-017 | Custom completion sound file (optional path)                                                                                                            | Same completion event; `HTMLAudioElement` in renderer                                                                 | unit: invalid path ignored; manual: plays on background completion      |
| FEAT-019 | Cache git remote URL per repo root (TTL)                                                                                                                | Mirror `repoRootCache` pattern in `electron/gitEngine.ts`; `getRemoteUrl()` currently uncached                        | unit: cache hit avoids second git spawn; invalidation on action         |
| FEAT-026 | Complete plugin API surface: expose read-only git snapshot (`PluginGitSnapshot` already declared) and wire `pty` prompt hook; sync `@involvex/term-sdk` | `pluginTypes.ts` declares snapshot; prompt events already flow through pty/cwd tracker                                | unit: API shape; SDK typecheck; example plugin smoke                    |
| FEAT-027 | Focus-trap tests + modal audit                                                                                                                          | `src/lib/focusTrap.ts` exists but has 0% coverage; modals already present                                             | unit: tab cycle, shift-tab, restore focus on close                      |

## v0.13 — Git you can read

Read-only git affordances. **No commit/stage UI** — use the shell.

| ID                | Item                                                                           | Why shippable                                                                           | Verify                                                            |
| ----------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| FEAT-016 (scoped) | Recent commits list in Git footer menu (last 5 `--oneline`, read-only)         | `getGitDetails`/menu pattern exists; cheap git spawn behind menu open                   | unit: parse output; manual: click commit copies hash/subject      |
| FEAT-028          | Read-only inline diff preview from Changes row (`git diff -- <path>` in modal) | `listChanges()` already returns paths/status; modal + IPC handler pattern established   | unit: diff parser/empty states; manual: staged/unstaged/untracked |
| FEAT-029          | Changes row actions: Reveal in Explorer, Copy relative path                    | `shell:showItemInFolder` and clipboard IPC already exposed                              | manual: actions work from footer Changes view                     |
| FEAT-022          | Per-project auto-start profile (map repo root/cwd to profile)                  | `ptySpawn` accepts `profileId`; cwd tracked by OSC 7; settings schema is zod-extensible | unit: mapping resolver; manual: open repo gets mapped profile     |

## v0.14 — Memory & session ergonomics

| ID       | Item                                                                                            | Why shippable                                                                          | Verify                                                                    |
| -------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FEAT-018 | Built-in snippet templates (Git/Bun/OpenCode/Docker/common shell) with “add to snippets” action | `SnippetSchema` + palette already render snippets; templates are static data           | unit: template ids unique; manual: insert without auto-run                |
| FEAT-030 | Named session layouts: save/restore tab+pane+split layout by name                               | `session.json` already serializes tabs/panes/ratios; add named snapshots file          | unit: serialize/restore round-trip; manual: restore preserves cwd/profile |
| FEAT-020 | Animated quake dropdown open/close (respect reduced-motion)                                     | `electron/quake.ts` owns show/hide; animation is additive window bounds/CSS            | manual: no flicker; reduced-motion disables animation                     |
| FEAT-031 | Opt-in sync of recent dirs/commands in Gist portable subset (clipboard ring stays local)        | `settingsSync.ts` has explicit portable subset; `shellMemory.ts` is separate by design | unit: portable payload excludes clipboard; manual: push/pull round-trip   |

## Hardening / distribution follow-ups

| ID       | Item                                                                                                              | Status / gate                                |
| -------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| FEAT-032 | Raise coverage for `src/lib/panes.ts` and `src/lib/focusTrap.ts`; add regression tests for pane split/close/focus | Code-ready; pure tests                       |
| FEAT-033 | Add Windows CI job for `bun run build:electron` (no node-pty rebuild) to catch Windows-path/import regressions    | Code-ready; workflow change                  |
| FOLLOW-1 | Authenticode-sign sparse Explorer MSIX for zero-friction Win11 top-level menu                                     | **Blocked on certificate** — not code-ready  |
| FOLLOW-2 | Full inline diff viewer polish beyond FEAT-028 (hunks, syntax highlight)                                          | Defer until FEAT-028 ships and proves useful |

## Explicitly out of scope

- Built-in SSH session manager (use `ssh` in the shell)
- Broadcast input to all panes
- Built-in AI chat that duplicates OpenCode
- In-app git commit/stage UI (use the shell)
- Signed / notarized macOS builds until Apple certs exist

## Deferred / high-risk (needs design before scheduling)

- **FEAT-013 / FEAT-023** — Plugin sandboxing / filesystem restriction. Security-sensitive and high effort; do **after** FEAT-005 trust gate and API cleanup, with a threat model.
- **FEAT-016 full graph** — Graph rendering is high effort; scoped recent-commits list is the shippable slice.
- **Broadcast/mux** — Conflicts with pane isolation model; no current seam.
