/**
 * Bridge `settings.theme` into the CSS custom properties declared in
 * `index.css`.
 *
 * Only `--theme-bg` and `--theme-fg` are written. Every surface, text and
 * border token is a `color-mix()` derived from those two in the stylesheet, so
 * keeping the colour math in CSS means a theme preset repaints the whole app
 * from two inputs instead of just the xterm canvas.
 */

/** Matches the `:root` fallbacks in `index.css` and the settings schema. */
export const FALLBACK_THEME_BG = '#1e1e1e'
export const FALLBACK_THEME_FG = '#cccccc'

/** Minimal surface needed to write custom properties (a real element, or a stub). */
interface StyleTarget {
	style: {setProperty(name: string, value: string): void}
}

/**
 * True when `value` is a colour the browser will actually accept.
 *
 * This matters more than it looks: one unparseable `--theme-bg` does not just
 * break the app background, it poisons every `color-mix()` that references it,
 * so the whole ramp collapses. A bad value in `settings.json` falls back to the
 * default here instead of cascading.
 */
export function isUsableColor(value: unknown): boolean {
	if (typeof value !== 'string' || !value.trim()) return false
	// Outside a DOM (unit tests) there is no CSS to ask, so accept hex only —
	// that covers every shipped preset.
	if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
		return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())
	}
	return CSS.supports('color', value)
}

/** Resolve a theme colour, falling back when it is missing or unusable. */
export function resolveThemeColor(value: unknown, fallback: string): string {
	return isUsableColor(value) ? (value as string).trim() : fallback
}

/**
 * Write `--theme-bg` / `--theme-fg` onto the document root.
 *
 * No-ops without a DOM so it is safe to call from tests or SSR-ish contexts.
 */
export function applyThemeTokens(
	theme: {bg?: string; fg?: string} | null | undefined,
	root?: StyleTarget | null,
): void {
	const el =
		root ??
		(typeof document === 'undefined'
			? null
			: (document.documentElement as unknown as StyleTarget))
	if (!el) return
	el.style.setProperty(
		'--theme-bg',
		resolveThemeColor(theme?.bg, FALLBACK_THEME_BG),
	)
	el.style.setProperty(
		'--theme-fg',
		resolveThemeColor(theme?.fg, FALLBACK_THEME_FG),
	)
}
