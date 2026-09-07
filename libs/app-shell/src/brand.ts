import { esc } from './html.js'

// S18 — tenant brand theming. The design system is already driven by CSS custom properties
// (--color-action-primary / --color-action-accent), so applying a brand = overriding those two
// on :root, plus remembering the wordmark that replaces "playfusion" in the topbars.

export interface Brand { logoText: string; primaryColor: string; accentColor: string }

let currentLogo: string | null = null

// The PlayFusion mark ("Campo"): hexagon + peak, brand blue/orange. Shown only alongside the
// DEFAULT wordmark — a tenant with its own logoText keeps its brand, never gets this mark.
const PF_MARK =
  '<svg class="pf-mark" viewBox="0 0 64 64" aria-hidden="true">' +
  '<polygon points="32,6 56,19 56,45 32,58 8,45 8,19" fill="none" stroke="#0b5fff" stroke-width="6" stroke-linejoin="round"/>' +
  '<path d="M20 42 L32 24 L44 42" fill="none" stroke="#ff6b00" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * Apply a tenant brand (or clear it with null). Sets the two accent CSS custom properties on the
 * document root and remembers the wordmark for {@link brandWordmark}. Returns the wordmark, or null
 * for the default theme. Safe to call in non-DOM contexts (the colour side-effect is skipped).
 */
export function applyBrand(brand: Brand | null): string | null {
  const root = typeof document !== 'undefined' ? document.documentElement : null
  if (!brand) {
    root?.style.removeProperty('--color-action-primary')
    root?.style.removeProperty('--color-action-accent')
    currentLogo = null
    return null
  }
  root?.style.setProperty('--color-action-primary', brand.primaryColor)
  root?.style.setProperty('--color-action-accent', brand.accentColor)
  currentLogo = brand.logoText.trim() || null
  return currentLogo
}

/** The wordmark HTML for the topbars: the branded logoText (escaped) or the default PlayFusion
 *  mark + wordmark. Branded tenants never get the PlayFusion mark. */
export function brandWordmark(): string {
  return currentLogo ? esc(currentLogo) : `${PF_MARK}play<b>fusion</b>`
}
