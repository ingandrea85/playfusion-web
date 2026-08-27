import type { Client } from '@playfusion/rest-client'
import type { Entitlements } from '@playfusion/entitlements'

export interface ViewCtx {
  client: Client
  orgId: string
  e3BaseUrl: string
  navigate: (hash: string) => void
  refresh: () => void
  /** SP2: the logged-in user has the global `platform_admin` role (gates the finals-format editor). */
  isPlatformAdmin: boolean
  /** T1: what the org's plan unlocks (computed once at boot from the subscription). */
  entitlements: Entitlements
}

/** T1: a "requires Pro" lock shown in place of a plan-gated feature, with an upgrade link. */
export const lockCard = (feature: string): string =>
  `<div class="pf-card pf-lock">
    <div class="pf-lock__ic">🔒</div>
    <h2 class="pf-h3" style="margin:0">${feature} — richiede Pro</h2>
    <p class="pf-muted" style="margin:6px 0 14px">Con il piano Free questa funzione è disattivata. Passa a Pro per sbloccarla.</p>
    <a class="pf-btn pf-btn--primary" href="#/org/subscription">Passa a Pro</a>
  </div>`

/** A screen = pure render(data) + optional mount(root,ctx,data) that wires DOM events and
 *  calls the rest-client. load() fetches the data render() needs. Keeps render testable. */
export interface Screen<D> {
  load(ctx: ViewCtx, params: Record<string, string>): Promise<D>
  render(data: D): string
  mount?(root: HTMLElement, ctx: ViewCtx, data: D): void
}

export const errorCard = (msg: string): string =>
  `<main class="pf-container"><div class="pf-card">${msg}</div></main>`
export const inlineError = (msg: string): string =>
  `<div class="pf-card" role="alert" style="border-color:var(--color-feedback-danger);margin-bottom:var(--space-md)">${msg}</div>`

/** Load → render → mount for one route; a load failure renders the error card (never blank). */
export async function runScreen<D>(root: HTMLElement, ctx: ViewCtx, params: Record<string, string>, screen: Screen<D>): Promise<void> {
  try {
    const data = await screen.load(ctx, params)
    root.innerHTML = screen.render(data)
    screen.mount?.(root, ctx, data)
  } catch {
    root.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.')
  }
}
