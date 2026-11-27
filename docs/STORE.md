# Microsoft Store — Involvex Term

Dual-channel Windows distribution: **GitHub NSIS/portable** (GitHub auto-update)
and **Store APPX/MSIX** (Store updates only). Do **not** run `msstore init` on
this Bun repo (it assumes npm/yarn).

**Live:** [Involvex Term on Microsoft Store](https://apps.microsoft.com/detail/9NBNBH9CJ507)
(`9NBNBH9CJ507`). Share:
https://apps.microsoft.com/store/detail/9NBNBH9CJ507?cid=DevShareMCLPCS

### Store badge

GitHub Pages (`docs/index.html`) uses the official web component:

```html
<script type="module" src="https://get.microsoft.com/badge/ms-store-badge.bundled.js"></script>
<ms-store-badge
	productid="9NBNBH9CJ507"
	window-mode="full"
	theme="auto"
	size="large"
	language="en-us"
	animation="on">
</ms-store-badge>
```

Markdown / README (no custom elements) use the static badge image:

```html
<a href="https://apps.microsoft.com/detail/9NBNBH9CJ507?referrer=appbadge&mode=full" target="_blank" rel="noopener noreferrer">
	<img src="https://get.microsoft.com/images/en-us%20dark.svg" width="200" alt="Get it from Microsoft Store" />
</a>
```

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

## 3. First submission (done)

Submission 1 is **published**. First-time Partner Center work (IARC age
ratings, `runFullTrust` justification, listing, screenshots) is complete —
see [`store/submission-notes.md`](store/submission-notes.md).

Optional local check (admin): Windows App Certification Kit

```powershell
bun scripts/run-wack.mjs
```

## 4. Updates (`msstore` CLI)

```powershell
bun run build:store
bun run publish:store
```

`publish:store` runs `msstore publish` with `--noCommit` by default so you can
review the draft in Partner Center before committing (`bun run commit:store`).
