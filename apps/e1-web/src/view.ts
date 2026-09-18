import type { Client, OrgRole } from '@playfusion/rest-client'
import type { Entitlements } from '@playfusion/entitlements'

export interface ViewCtx {
  client: Client
  orgId: string
  e3BaseUrl: string
  navigate: (hash: string) => void
  refresh: () => void
  /** SP2: the logged-in user has the global `platform_admin` role (gates the finals-format editor). */
  isPlatformAdmin: boolean
  /** T4: the user's org role (OWNER manages billing/brand/members; ORGANIZER operates events). */
  orgRole: OrgRole
  /** T1: what the org's plan unlocks (computed once at boot from the subscription). */
  entitlements: Entitlements
}

/** T1: a "requires Pro" lock shown in place of a plan-gated feature, with an upgrade link. */
export const lockCard = (feature: string): string =>
  `<div class="pf-card pf-lock">
    <div class="pf-lock__ic" aria-hidden="true">🔒</div>
    <h2 class="pf-h3" style="margin:0">${feature} — richiede Pro</h2>
    <p class="pf-muted" style="margin:6px 0 14px">Con il piano Free questa funzione è disattivata. Passa a Pro per sbloccarla.</p>
    <a class="pf-btn pf-btn--primary" href="#/org/subscription">Passa a Pro</a>
  </div>`

/** T4: shown when an ORGANIZER reaches an owner-only surface (members, brand, billing). */
export const notAuthorizedCard = (feature: string): string =>
  `<div class="pf-card pf-lock">
    <div class="pf-lock__ic" aria-hidden="true">🔒</div>
    <h2 class="pf-h3" style="margin:0">${feature} — riservato all'owner</h2>
    <p class="pf-muted" style="margin:6px 0 14px">Solo il proprietario dell'organizzazione può gestire questa sezione. Chiedi all'owner del tuo team.</p>
    <a class="pf-btn pf-btn--ghost" href="#/">Torna ai tornei</a>
  </div>`

/** A screen = pure render(data) + optional mount(root,ctx,data) that wires DOM events and
 *  calls the rest-client. load() fetches the data render() needs. Keeps render testable. */
export interface Screen<D> {
  load(ctx: ViewCtx, params: Record<string, string>): Promise<D>
  render(data: D): string
  mount?(root: HTMLElement, ctx: ViewCtx, data: D): void
}

export const errorCard = (msg: string): string =>
  `<main id="pf-main" class="pf-container"><div class="pf-card">${msg}</div></main>`
export const inlineError = (msg: string): string =>
  `<div class="pf-card" role="alert" style="border-color:var(--color-feedback-danger);margin-bottom:var(--space-md)">${msg}</div>`

/** E1-4: a recoverable screen-error state. `retry` wires a "Riprova" button (re-runs the screen's
 *  load); `home` always offers a way back to the tournament list so a dead-end deep link isn't a trap. */
export const screenErrorCard = (msg: string, opts: { retry?: boolean; home?: boolean } = { retry: true, home: true }): string =>
  `<main id="pf-main" class="pf-container"><div class="pf-card" role="alert" style="border-color:var(--color-feedback-danger)">
    <p style="margin-top:0">${msg}</p>
    <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm)">
      ${opts.retry ? '<button class="pf-btn pf-btn--primary" type="button" data-retry>Riprova</button>' : ''}
      ${opts.home !== false ? '<a class="pf-btn" href="#/">← Torna ai tornei</a>' : ''}
    </div>
  </div></main>`

/** E1-10: a lightweight placeholder painted before load() resolves, so a slow navigation doesn't
 *  leave the previous screen on screen. */
export const skeletonCard = (): string =>
  `<main id="pf-main" class="pf-container"><div class="pf-card pf-skeleton" aria-hidden="true">
    <div class="pf-skeleton__bar pf-skeleton__bar--title"></div>
    <div class="pf-skeleton__bar"></div>
    <div class="pf-skeleton__bar"></div>
    <div class="pf-skeleton__bar"></div>
  </div></main>`

/** Load → render → mount for one route; a load failure renders a recoverable error card (never blank).
 *  A 404 is a dead end (the tournament is gone) → offer only the way home; transient errors keep Riprova. */
export async function runScreen<D>(root: HTMLElement, ctx: ViewCtx, params: Record<string, string>, screen: Screen<D>): Promise<void> {
  root.innerHTML = skeletonCard()
  try {
    const data = await screen.load(ctx, params)
    root.innerHTML = screen.render(data)
    screen.mount?.(root, ctx, data)
  } catch (e) {
    const notFound = (e as { status?: number } | null)?.status === 404
    root.innerHTML = notFound
      ? screenErrorCard('Torneo non trovato. Potrebbe essere stato eliminato o il link non è più valido.', { retry: false, home: true })
      : screenErrorCard('Si è verificato un errore nel caricamento.', { retry: true, home: true })
    root.querySelector('[data-retry]')?.addEventListener('click', () => { void runScreen(root, ctx, params, screen) })
  }
}
