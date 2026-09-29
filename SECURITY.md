# Security policy

## Threat model

involvex-term is a local desktop terminal. Its main-process attack surface is:

- **Plugin host.** Local plugins run unsandboxed with full Node.js access in
  the main process — the same process that spawns shells and holds settings.
  Plugins are off by default (`plugins.enabled: false`). Only run plugins you
  wrote yourself or fully trust, the same way you would trust a shell profile
  script. A malicious or buggy plugin can read files, spawn processes, and
  observe pty data.
- **PTY-spawn env injection.** Optional agent env hooks (`agent.envHooks`, off
  by default) inject `INVOLVEX_TERM_*` / `TERM_PROGRAM` variables into spawned
  shells. Review hook content before enabling; spawned shells and any agent
  CLI running in them see these values.
- **Gist-sync token.** Settings sync stores a GitHub OAuth token and gist id
  in `~/.involvex-term/sync.json`. Anyone with read access to that file can
  push/pull the synced settings gist. Protect your home directory and revoke
  the OAuth grant if the file may have been exposed.
- **CLI install path handling.** The `involvex-term` CLI resolves install and
  launch paths (release junctions, Desktop shortcut target). Only run CLI
  binaries from releases you trust, and verify the resolved install path
  before granting elevation or changing system-wide install locations.

## How to report

Report vulnerabilities via **GitHub Security Advisories only** on
`involvex/involvex-term`. Do not open public issues for security concerns.

## Scope

- In scope: the latest release (reproducible binaries and published tags).
  `main` between releases is not covered.
- Out of scope: CVEs in upstream xterm.js / node-pty / Electron, and OS-level
  issues outside this repo's code.
