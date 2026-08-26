import { esc } from './html.js'

// S18 — tenant brand theming. The design system is already driven by CSS custom properties
// (--color-action-primary / --color-action-accent), so applying a brand = overriding those two
// on :root, plus remembering the wordmark that replaces "playfusion" in the topbars.

export interface Brand { logoText: string; primaryColor: string; accentColor: string }

let currentLogo: string | null = null

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

/** The wordmark HTML for the topbars: the branded logoText (escaped) or the default PlayFusion mark. */
export function brandWordmark(): string {
  return currentLogo ? esc(currentLogo) : 'play<b>fusion</b>'
}
