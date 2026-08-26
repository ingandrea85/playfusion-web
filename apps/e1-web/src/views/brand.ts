import { esc, applyBrand } from '@playfusion/app-shell'
import type { Brand, EventDetail } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'
import { workspaceShell } from './workspace.js'

export interface BrandData { event: EventDetail; brand: Brand | null }

// Token defaults (tokens.css) — the starting point when the tenant has no brand yet.
const DEFAULT_PRIMARY = '#0b5fff'
const DEFAULT_ACCENT = '#ff6b00'

/** Live preview block: the wordmark, a primary button and an accent badge, coloured from the form. */
function preview(logoText: string, primary: string, accent: string): string {
  const mark = logoText ? esc(logoText) : 'play<b>fusion</b>'
  return `<div class="pf-brandprev" id="b-prev">
    <span class="pf-brandprev__mark">${mark}</span>
    <span class="pf-btn pf-btn--primary" style="background:${esc(primary)};border-color:${esc(primary)}">Bottone</span>
    <span class="pf-annchip" style="background:color-mix(in srgb, ${esc(accent)} 16%, transparent);color:${esc(accent)}">Badge</span>
  </div>`
}

export function renderBrand(data: BrandData, activeTab = 'brand'): string {
  const b = data.brand
  const logoText = b?.logoText ?? ''
  const primary = b?.primaryColor ?? DEFAULT_PRIMARY
  const accent = b?.accentColor ?? DEFAULT_ACCENT
  const body = `<div id="err"></div>
    <div class="pf-card">
      <h2 class="pf-h3">Brand organizzazione</h2>
      <p class="pf-muted">Logo testuale e colori del tuo brand, applicati allo spazio organizzatore e al portale pubblico. Lascia vuoto per usare il tema PlayFusion.</p>
      <div class="pf-field"><label>Logo (testo)</label><input id="b-logo" maxlength="40" placeholder="Es. Acme Cup" value="${esc(logoText)}" /></div>
      <div class="pf-row" style="gap:var(--space-lg)">
        <div class="pf-field" style="margin-bottom:0"><label>Colore primario</label><input id="b-primary" type="color" value="${esc(primary)}" /></div>
        <div class="pf-field" style="margin-bottom:0"><label>Colore accento</label><input id="b-accent" type="color" value="${esc(accent)}" /></div>
      </div>
      <div class="pf-eyebrow" style="margin-top:var(--space-md)">Anteprima</div>
      ${preview(logoText, primary, accent)}
      <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm);margin-top:var(--space-md)">
        <button class="pf-btn pf-btn--primary" id="b-save">Salva</button>
        <button class="pf-btn pf-btn--ghost" id="b-reset">Ripristina default</button>
      </div>
    </div>`
  return workspaceShell(data.event, activeTab, body)
}

export const brandScreen: Screen<BrandData> = {
  load: async (ctx, p) => {
    const [event, brand] = await Promise.all([
      ctx.client.o3.getEvent(p.id),
      ctx.client.o1.getBrand(ctx.orgId).catch(() => null as Brand | null),
    ])
    return { event, brand }
  },
  render: (data) => renderBrand(data),
  mount(root, ctx: ViewCtx, _data) {
    const err = root.querySelector('#err')!
    const fail = (msg: string) => { err.innerHTML = inlineError(msg) }
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
    const logo = q<HTMLInputElement>('#b-logo')
    const primary = q<HTMLInputElement>('#b-primary')
    const accent = q<HTMLInputElement>('#b-accent')

    // Re-render the preview on every edit. #b-prev is replaced via outerHTML, so re-query each time.
    const redrawPreview = () => { root.querySelector('#b-prev')!.outerHTML = preview(logo.value.trim(), primary.value, accent.value) }
    for (const el of [logo, primary, accent]) el.addEventListener('input', redrawPreview)

    q<HTMLButtonElement>('#b-save').addEventListener('click', async () => {
      const logoText = logo.value.trim()
      if (!logoText) { fail('Inserisci un logo testuale.'); return }
      const brand: Brand = { logoText, primaryColor: primary.value, accentColor: accent.value }
      const btn = q<HTMLButtonElement>('#b-save'); btn.disabled = true
      try { await ctx.client.o1.setBrand(ctx.orgId, brand); applyBrand(brand); ctx.refresh() }
      catch { fail('Salvataggio non riuscito. Riprova.'); btn.disabled = false }
    })

    q<HTMLButtonElement>('#b-reset').addEventListener('click', async () => {
      try { await ctx.client.o1.resetBrand(ctx.orgId); applyBrand(null); ctx.refresh() }
      catch { fail('Ripristino non riuscito. Riprova.') }
    })
  },
}
