# Icons sprite

`sprite.svg` contains the curated icon set for the design system.

## Available icons

`check`, `x`, `chevron-down`, `chevron-up`, `chevron-left`, `chevron-right`, `plus`, `search`, `trash`, `edit`, `info`, `alert-triangle`, `check-circle`, `more-horizontal`, `square` (fallback).

## Usage

The sprite must be inlined at the document root once (apps do this in their `index.html`, Storybook does it in `preview.ts`). After that, `<pf-icon name="check">` resolves via `<use href="#pf-icon-check">`.

## Adding new icons

1. Pick from [Lucide](https://lucide.dev/icons) (MIT licensed)
2. Copy the inner SVG content (everything inside `<svg>...</svg>`)
3. Wrap in `<symbol id="pf-icon-NAME" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">...</symbol>`
4. Add to `sprite.svg`
5. Add the name to `icon-names.ts` (single source of truth for JS/Storybook)
6. Mention in this README

A future automation script could regenerate this from a list of icon names. Manual curation is fine while the set is small.
