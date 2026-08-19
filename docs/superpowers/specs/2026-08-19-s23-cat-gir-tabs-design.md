# S23 — Category/girone tabs for calendar & standings (design)

- **Date:** 2026-08-19 · **Epic:** [#80](https://github.com/ingandrea85/playfusion-web/issues/80) ·
  **Issues:** #81 app-shell · #82 e1 calendar · #83 e1 standings · #84 e3 calendar+standings.
- **Reference:** mockup `docs/superpowers/specs/2026-07-17-calendar-standings-tabs-design.md`.
- **Scope:** UI only — no backend/model change. **Branch:** `feature/s23-cat-gir-tabs`.

## Goal
Everywhere a calendar or standings is shown, add **Category** + **Girone** filter tabs. Default:
first category, girone "Tutti"; changing category resets girone to "Tutti". 4 surfaces: E1
calendar (schedule view), E1 Classifiche, E3 calendar, E3 standings. In 2.0 E1 calendar & standings
are separate workspace tabs, so each has its own bar (the mockup's shared bar was a single page).

## Design
- **app-shell** `renderTabs(items:{key,label}[], activeKey)` → `.pf-tabs` (scrollable on mobile) of
  `.pf-tab[data-key][aria-selected]`; stateless. Helpers `categoryKeys(items)` /
  `groupKeys(items, cat)` derive distinct keys from any `{categoryId, groupLabel}` list (matches or
  standings groups both satisfy it).
- **Per view:** local `selCat` (default first) + `selGir` ('ALL'); a `draw()` re-renders the two tab
  bars + the body (`renderCalendar`/`renderStandings` unchanged, fed filtered data) and rebinds tab
  clicks. The E1 calendar redraw also rewires the per-match Risultato/Modifica buttons.
- **E3** (no Screen framework): views export `wirePublicCalendar`/`wirePublicStandings` that main.ts
  calls after setting innerHTML. Tabs appear only when there is data (calendar gated on PUBLISHED).

## Success
Category/girone tabs filter each calendar/standings; default first category + all gironi; changing
category resets girone; bars scroll on mobile; existing tests stay green (no logic/store change).
