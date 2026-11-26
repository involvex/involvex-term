# Microsoft Store — Involvex Term

Dual-channel Windows distribution: **GitHub NSIS/portable** (GitHub auto-update)
and **Store APPX/MSIX** (Store updates only). Do **not** run `msstore init` on
this Bun repo (it assumes npm/yarn).

## 1. Reserve the product (human)

1. Open [Partner Center](https://partner.microsoft.com/dashboard) → **New product**.
2. Choose **MSIX or PWA app** (not EXE/MSI, not a game, not a PWA website).
3. Reserve the name **Involvex Term**.
4. Product management → **Product identity** — copy:

| Partner Center field                    | Paste into                     |
| --------------------------------------- | ------------------------------ |
| Package/Identity/Name                   | `STORE_IDENTITY_NAME`          |
| Package/Identity/Publisher              | `STORE_PUBLISHER` (`CN=…`)     |
| Package/Properties/PublisherDisplayName | `STORE_PUBLISHER_DISPLAY_NAME` |

5. Also note the **Store ID** (12-character product id) for in-app “Check for
   updates” → Store page (`ms-windows-store://pdp/?ProductId=…`). Set
   `STORE_PRODUCT_ID` when known.

Create a local (gitignored) env file or export before building:

```powershell
$env:STORE_IDENTITY_NAME = 'YourPublisher.InvolvexTerm'   # exact from Partner Center
$env:STORE_PUBLISHER = 'CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'
$env:STORE_PUBLISHER_DISPLAY_NAME = 'involvex'
$env:STORE_PRODUCT_ID = '9NXXXXXXXXXX'   # optional until first live listing
```

Or copy [`store-identity.example.env`](../store-identity.example.env) →
`store-identity.env` and fill it in (gitignored).

## 2. Build the Store package

```powershell
bun run build:store
```

Produces `release/<version>/involvex-term-*.appx` and a sibling `.msix` copy
(unsigned — the Store signs it). Explorer sparse MSIX is **not** included.

## 3. First submission (Partner Center)

`msstore` cannot create the first submission. In Partner Center:

- Age ratings (IARC), pricing **Free**, category **Developer tools**
- Privacy URL: `https://involvex.github.io/involvex-term/privacy.html`
- `runFullTrust` justification: _Terminal emulator; must spawn user shells via
  ConPTY, access the real filesystem, and run developer CLIs._
- Screenshots ≥ **1366×768** (see `docs/store/`)
- Upload the `.msix`, submit for certification

Optional local check (admin): Windows App Certification Kit

```text
appcert.exe test -appxpackagepath C:\path\to\package.msix -reportoutputpath report.xml
```

## 4. Later updates (`msstore` CLI)

After the app is live:

```powershell
bun run build:store
bun run publish:store
```

`publish:store` runs `msstore publish` with `--noCommit` by default so you can
review the draft in Partner Center before committing.
