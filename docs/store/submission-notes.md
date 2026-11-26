# Partner Center — first submission checklist

Product: **Involvex Term** · Store ID **`9NBNBH9CJ507`**  
Package identity: `Einzelunternehmen.InvolvexTerm`  
Publisher: `CN=50777D18-6AA9-43B0-9CE5-BB776BC9514F`  
PublisherDisplayName: `involvex`  
PFN: `Einzelunternehmen.InvolvexTerm_nk2dxr82q950t`  
Store URL: https://apps.microsoft.com/detail/9NBNBH9CJ507  
Protocol: `ms-windows-store://pdp/?productid=9NBNBH9CJ507`

Dashboard: https://partner.microsoft.com/dashboard/products/9NBNBH9CJ507/submissions  
Draft: https://partner.microsoft.com/dashboard/products/9NBNBH9CJ507/submissions/1152921505702518944

## Already done (API)

- Category: **DeveloperTools** · Pricing: **Free** · Desktop only
- en-US listing (title, description, features, keywords, release notes)
- Screenshots `shot-1/2/3.png` → **Uploaded**
- Package `involvex-term-0.10.0.msix` → **Uploaded** (identity matches Product identity)
- Notes for certification include `runFullTrust` justification
- Privacy URL in listing copy: https://involvex.github.io/involvex-term/privacy.html
- WACK local report: `OVERALL_RESULT=PASS` (elevated re-run needs admin UAC)

## Status (2026-11-27)

**In certification** — Submission 1. Pre-processing passed; publishing starts
automatically after certification (usually hours, up to ~3 business days).

CLI check: `msstore submission status 9NBNBH9CJ507` → `Certification`.

## `runFullTrust` restricted-capability approval (paste into Partner Center)

Involvex Term is a desktop terminal emulator (Electron + ConPTY/node-pty), not a
sandboxed UWP app. `runFullTrust` is required for the product’s core function:
hosting interactive developer shells with the same trust and filesystem access
as a normal Win32 terminal (Windows Terminal, ConEmu, etc.).

Concrete uses:

1. Spawn and host user shells via ConPTY — PowerShell 7, Windows PowerShell,
   cmd.exe, and WSL. The app creates a real console session, pumps stdin/stdout,
   and resizes the PTY. This cannot run inside the UWP app container.
2. Access the real filesystem as the signed-in user — shells must cd, read/write
   project files, run build tools, and use Git in arbitrary directories the user
   chooses (not only the package install folder under WindowsApps).
3. Run developer CLIs the user installs — git, node, bun, compilers, package
   managers, and similar tools invoked from the shell. Those executables live
   outside the package and must run with normal desktop process rights.
4. Optional local features that need desktop APIs — process list for the in-app
   Process Manager, system tray, and opening http(s) / mailto links in the
   default browser via the shell API.

We do not use `runFullTrust` for kernel drivers, services, or elevating to
Administrator by default. The capability is only so the packaged Electron host
can behave as a standard full-trust desktop terminal. Closing the window quits
by default on Store builds; tray is optional and user-controlled.

Short form: Terminal emulator; must spawn interactive user shells via ConPTY
(PowerShell/cmd/WSL), access the user’s real filesystem, and run developer CLIs.
Same class of app as Windows Terminal; cannot function in a pure UWP sandbox.

## Local package rebuild

```powershell
bun run build:store
# → release/0.10.0/involvex-term-0.10.0.msix
```

## After certification

Later updates: `bun run build:store` then `bun run publish:store`.
