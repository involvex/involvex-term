import {describe, expect, it} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import SettingsModal from '../../src/components/SettingsModal.tsx'
import type {AppSettings} from '../../src/types.ts'

/**
 * Renders the real Settings modal, because the bug this guards was in the
 * banner's guard and not in anything it displayed.
 *
 * It shipped because `rejectedKey !== '\n'` was always true: the key is built
 * by interpolation, so with nothing to report it is `"0\n"`, never `"\n"`. The
 * result was a permanent "0 values in settings.json are invalid and were reset
 * to their default" on a file the schema parsed cleanly. Unit-testing the
 * extracted predicate covers the logic; only rendering covers the wiring.
 *
 * renderToStaticMarkup rather than a DOM: effects never run here, and the
 * finding this needs to check arrives as props at mount.
 */
const settings = {theme: {fontSize: 14}} as unknown as AppSettings

const render = (
	rejected: string[] | undefined,
	rejectedTotal: number | undefined,
) =>
	renderToStaticMarkup(
		<SettingsModal
			settings={settings}
			rejected={rejected}
			rejectedTotal={rejectedTotal}
			onChange={() => {}}
			onClose={() => {}}
		/>,
	)

/** The warning's headline, e.g. "1 value in settings.json is invalid". */
const BANNER = /values? in settings\.json (?:is|are) invalid/
const KEPT = /Everything else\s+was kept/

describe('settings rejection banner', () => {
	it('renders nothing when the report is empty', () => {
		const html = render([], 0)
		expect(html).not.toMatch(BANNER)
		expect(html).not.toMatch(KEPT)
	})

	it('renders nothing when the main process sends no finding at all', () => {
		const html = render(undefined, undefined)
		expect(html).not.toMatch(BANNER)
	})

	it('reports a real rejection with its count and path', () => {
		const html = render(['theme.fontSize'], 1)
		expect(html).toMatch(BANNER)
		expect(html).toMatch(/1 value in settings\.json is invalid/)
		expect(html).toMatch(/theme\.fontSize/)
		expect(html).toMatch(KEPT)
	})

	it('shows the true count rather than the capped sample length', () => {
		// 300 rejections, 8 listed. Reporting "8" would claim those were all of
		// them, which is the opposite of the point of the banner.
		const html = render(['a.b', 'c.d'], 300)
		expect(html).toMatch(/300 values in settings\.json are invalid/)
	})
})
