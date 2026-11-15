/**
 * Bridge `settings.theme` into the CSS custom properties declared in
 * `index.css`.
 *
 * `--theme-bg` and `--theme-fg` are the only colours written. Every surface,
 * text and border token is a `color-mix()` derived from those two in the
 * stylesheet, so keeping the colour math in CSS means a theme preset repaints
 * the whole app from two inputs instead of just the xterm canvas.
 *
 * `--font-ui` is the one non-colour input: the chrome font stack, so picking a
 * preset's typeface moves the whole app rather than just the terminal.
 */

/** Matches the `:root` fallbacks in `index.css` and the settings schema. */
export const FALLBACK_THEME_BG = '#1e1e1e'
export const FALLBACK_THEME_FG = '#cccccc'

/**
 * Chrome font stack, used before this module writes anything.
 *
 * Exactly the literal `App.css` carried before `--font-ui` existed, so a
 * pre-hydration paint is unchanged. It is intentionally *not* the terminal's
 * default stack: that one lists Nerd Font families, and naming them here would
 * make the chrome depend on fonts the chrome never used to ask for.
 */
export const FALLBACK_FONT_STACK = "'Cascadia Code', Consolas, monospace"

/** The theme fields this module reads. */
export interface ThemeInput {
	bg?: string
	fg?: string
	fontFamily?: string
	fontFallback?: string
}

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
 * True when a font stack is safe to write into a custom property.
 *
 * A custom property accepts almost any token stream, so a garbage value does
 * not get rejected on assignment - it lands in `font-family: var(--font-ui)`
 * and poisons the whole declaration. Rejecting here keeps a bad
 * `settings.json` entry to a wrong-looking font rather than unstyled chrome.
 */
export function isUsableFontStack(value: unknown): boolean {
	if (typeof value !== 'string') return false
	const v = value.trim()
	if (!v) return false
	// Statement terminators, block delimiters and comment openers are the ways a
	// value could escape the declaration it is substituted into.
	if (/[;{}]/.test(v)) return false
	if (/\/\*|\*\//.test(v)) return false
	return true
}

/**
 * Join the theme's primary family and fallback list into one stack.
 *
 * Both halves are optional and either may be blank, which is what the lenient
 * settings parser produces when a user edits `settings.json` by hand.
 */
export function resolveFontStack(theme: ThemeInput | null | undefined): string {
	const parts = [theme?.fontFamily, theme?.fontFallback]
		.map(p => (typeof p === 'string' ? p.trim() : ''))
		.filter(p => p.length > 0)
	return parts.join(', ')
}

/** Classic VS Code selection blue — matches `--selection-base` in index.css. */
export const FALLBACK_SELECTION_BG = '#264f78'

/**
 * Resolve a CSS colour value to a hex string the canvas/xterm APIs accept.
 *
 * Custom properties that use `color-mix()` stay unevaluated when read via
 * `getPropertyValue`; applying the value as an element colour and reading
 * `getComputedStyle` forces the browser to resolve it.
 */
export function resolveCssColor(value: string, fallback: string): string {
	if (typeof document === 'undefined') return fallback
	const probe = document.createElement('span')
	probe.style.color = value
	probe.style.display = 'none'
	document.documentElement.appendChild(probe)
	const resolved = getComputedStyle(probe).color
	probe.remove()
	const hex = rgbToHex(resolved)
	return hex ?? fallback
}

/** Convert `rgb()` / `rgba()` from getComputedStyle into `#rrggbb`. */
function rgbToHex(rgb: string): string | null {
	// Comma form (legacy) and space form (CSS Color 4), with optional alpha.
	const m = rgb.match(
		/^rgba?\(\s*([\d.]+)[%]?\s*[, ]\s*([\d.]+)[%]?\s*[, ]\s*([\d.]+)[%]?(?:\s*[,/]\s*[\d.%]+)?\s*\)$/i,
	)
	if (!m) return null
	const toByte = (n: string) =>
		Math.max(0, Math.min(255, Math.round(Number(n))))
			.toString(16)
			.padStart(2, '0')
	return `#${toByte(m[1]!)}${toByte(m[2]!)}${toByte(m[3]!)}`
}

/**
 * Resolved terminal selection colour for the current theme.
 *
 * Prefers the live `--selection-bg` token (tinted by `--theme-bg`). Falls back
 * to the classic blue when no DOM is available (tests / pre-hydration).
 */
export function resolveSelectionBackground(
	root: Element | null = typeof document === 'undefined'
		? null
		: document.documentElement,
): string {
	if (!root || typeof getComputedStyle === 'undefined')
		return FALLBACK_SELECTION_BG
	const raw = getComputedStyle(root).getPropertyValue('--selection-bg').trim()
	if (!raw) return FALLBACK_SELECTION_BG
	return resolveCssColor(raw, FALLBACK_SELECTION_BG)
}

/**
 * Write the theme's colours and font stack onto the document root.
 *
 * No-ops without a DOM so it is safe to call from tests or SSR-ish contexts.
 */
export function applyThemeTokens(
	theme: ThemeInput | null | undefined,
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
	const stack = resolveFontStack(theme)
	el.style.setProperty(
		'--font-ui',
		isUsableFontStack(stack) ? stack : FALLBACK_FONT_STACK,
	)
}
