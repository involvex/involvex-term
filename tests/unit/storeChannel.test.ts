import {afterEach, describe, expect, it} from 'bun:test'

describe('storeChannel', () => {
	const prev = process.env.INVOLVEX_STORE_CHANNEL

	afterEach(() => {
		if (prev === undefined) delete process.env.INVOLVEX_STORE_CHANNEL
		else process.env.INVOLVEX_STORE_CHANNEL = prev
		delete (process as NodeJS.Process & {windowsStore?: boolean}).windowsStore
	})

	it('detects INVOLVEX_STORE_CHANNEL=1', async () => {
		process.env.INVOLVEX_STORE_CHANNEL = '1'
		const {isStoreChannel} = await import(
			`../../electron/storeChannel.ts?t=${Date.now()}`
		)
		expect(isStoreChannel()).toBe(true)
	})

	it('is false when unset and not windowsStore', async () => {
		delete process.env.INVOLVEX_STORE_CHANNEL
		const {isStoreChannel} = await import(
			`../../electron/storeChannel.ts?t=${Date.now() + 1}`
		)
		expect(isStoreChannel()).toBe(false)
	})

	it('builds a Store product URL when STORE_PRODUCT_ID is set', async () => {
		process.env.STORE_PRODUCT_ID = '9NTESTPRODUCT'
		const {storeProductPageUrl} = await import(
			`../../electron/storeChannel.ts?t=${Date.now() + 2}`
		)
		expect(storeProductPageUrl()).toContain('ProductId=9NTESTPRODUCT')
		delete process.env.STORE_PRODUCT_ID
	})
})
