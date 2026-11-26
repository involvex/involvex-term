/**
 * Detect Microsoft Store / APPX packaging so dual-channel builds can
 * disable GitHub auto-update, DevTools, and developer-only error copy.
 *
 * Electron sets `process.windowsStore` when running from an AppX/MSIX
 * package. Also honour INVOLVEX_STORE_CHANNEL=1 for local testing.
 */
export function isStoreChannel(): boolean {
	if (process.env.INVOLVEX_STORE_CHANNEL === '1') return true
	return Boolean(
		(process as NodeJS.Process & {windowsStore?: boolean}).windowsStore,
	)
}

/** Optional 12-char Store product id (set at build via STORE_PRODUCT_ID). */
export function storeProductId(): string | null {
	const id = (process.env.STORE_PRODUCT_ID || '').trim()
	return id || null
}

export function storeProductPageUrl(): string {
	const id = storeProductId()
	if (id) return `ms-windows-store://pdp/?ProductId=${encodeURIComponent(id)}`
	return 'ms-windows-store://search/?query=Involvex%20Term'
}
