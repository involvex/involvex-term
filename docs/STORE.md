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
   `STORE_PRODUCT_ID` when known (Involvex Term: `9NBNBH9CJ507`).

Create a local (gitignored) env file or export before building:

```powershell
$env:STORE_IDENTITY_NAME = 'YourPublisher.InvolvexTerm'   # exact from Partner Center
$env:STORE_PUBLISHER = 'CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'
$env:STORE_PUBLISHER_DISPLAY_NAME = 'involvex'  # Package/Properties/PublisherDisplayName
$env:STORE_PRODUCT_ID = '9NBNBH9CJ507'
```

Involvex Term (reserved):

| Field                | Value                                            |
| -------------------- | ------------------------------------------------ |
| Identity Name        | `Einzelunternehmen.InvolvexTerm`                 |
| Publisher            | `CN=50777D18-6AA9-43B0-9CE5-BB776BC9514F`        |
| PublisherDisplayName | `involvex`                                       |
| Store ID             | `9NBNBH9CJ507`                                   |
| Store URL            | https://apps.microsoft.com/detail/9NBNBH9CJ507   |
| Protocol             | `ms-windows-store://pdp/?productid=9NBNBH9CJ507` |
| PFN                  | `Einzelunternehmen.InvolvexTerm_nk2dxr82q950t`   |

Or copy [`store-identity.example.env`](../store-identity.example.env) →
`store-identity.env` and fill it in (gitignored).

## 2. Build the Store package

```powershell
bun run build:store
```

Produces `release/<version>/involvex-term-*.appx` and a sibling `.msix` copy
(unsigned — the Store signs it). Explorer sparse MSIX is **not** included.

## 3. First submission (Partner Center)

Draft for Store ID `9NBNBH9CJ507` already has category, Free pricing, en-US
listing, screenshots, and the unsigned MSIX attached via API. Commit failed
once with `InvalidMicrosoftAgeRating` — **IARC must be completed in Partner
Center UI** (the Store submission API cannot set age ratings on the first
submission).

1. Open https://partner.microsoft.com/dashboard/products/9NBNBH9CJ507/submissions
2. Open the draft → **Age ratings** → complete the IARC questionnaire
   (category: productivity / developer tool; answer honestly — no gambling,
   no gratuitous violence, etc.). Save and generate.
3. Confirm Privacy policy URL:
   `https://involvex.github.io/involvex-term/privacy.html`
4. Confirm `runFullTrust` notes (already in Notes for certification).
5. **Submit for certification**, or after IARC:
   `msstore submission publish 9NBNBH9CJ507`

`runFullTrust` shows a PackageValidationWarning until Microsoft approves the
capability for this product (expected for terminals).

Optional local check (admin): Windows App Certification Kit

```powershell
bun scripts/run-wack.mjs
```

## 4. Later updates (`msstore` CLI)

After the app is live:

```powershell
bun run build:store
bun run publish:store
```

`publish:store` runs `msstore publish` with `--noCommit` by default so you can
review the draft in Partner Center before committing.
