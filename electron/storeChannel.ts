/**
 * Detect Microsoft Store / APPX packaging so dual-channel builds can
 * disable GitHub auto-update, DevTools, and developer-only error copy.
 *
 * Electron sets `process.windowsStore` when running from an AppX/MSIX
 * package. Also honour INVOLVEX_STORE_CHANNEL=1 for local testing.
 */
import {BAKED_STORE_PRODUCT_ID} from './storeProduct.generated.js'

export function isStoreChannel(): boolean {
	if (process.env.INVOLVEX_STORE_CHANNEL === '1') return true
	return Boolean(
		(process as NodeJS.Process & {windowsStore?: boolean}).windowsStore,
	)
}

/** Optional 12-char Store product id (env overrides build-time bake). */
export function storeProductId(): string | null {
	const fromEnv = (process.env.STORE_PRODUCT_ID || '').trim()
	if (fromEnv) return fromEnv
	const baked = (BAKED_STORE_PRODUCT_ID || '').trim()
	return baked || null
}

export function storeProductPageUrl(): string {
	const id = storeProductId()
	if (id) return `ms-windows-store://pdp/?ProductId=${encodeURIComponent(id)}`
	return 'ms-windows-store://search/?query=Involvex%20Term'
}
