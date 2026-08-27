import type { Client } from '@playfusion/rest-client'

export interface ViewCtx {
  client: Client
  orgId: string
  e3BaseUrl: string
  navigate: (hash: string) => void
  refresh: () => void
  /** SP2: the logged-in user has the global `platform_admin` role (gates the finals-format editor). */
  isPlatformAdmin: boolean
}

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
