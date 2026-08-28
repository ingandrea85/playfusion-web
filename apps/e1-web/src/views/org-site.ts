import { esc } from '@playfusion/app-shell'
import type { OrgSiteDefaults, Sponsor } from '@playfusion/rest-client'
import { inlineError, lockCard, notAuthorizedCard, type Screen, type ViewCtx } from '../view.js'
import { renderOrgShell } from './org.js'

export interface OrgSiteData { site: OrgSiteDefaults | null; locked?: boolean; forbidden?: boolean }

/** One editable sponsor row (name + url + tier + remove). Reused by the event editor. */
export function sponsorRow(s: Partial<Sponsor> = {}): string {
  return `<div class="pf-sprow pf-row" style="gap:var(--space-sm);align-items:flex-end">
    <div class="pf-field" style="margin:0;flex:1 1 auto"><label>Nome</label><input class="js-sp-name" value="${esc(s.name ?? '')}" placeholder="Es. Rossi Sport" /></div>
    <div class="pf-field" style="margin:0;flex:1 1 auto"><label>Link</label><input class="js-sp-url" value="${esc(s.url ?? '')}" placeholder="https://…" /></div>
    <div class="pf-field" style="margin:0;width:130px"><label>Ruolo</label><input class="js-sp-tier" value="${esc(s.tier ?? '')}" placeholder="Partner" /></div>
    <button type="button" class="pf-btn pf-btn--ghost js-sp-del" title="Rimuovi">✕</button>
  </div>`
}

/** Collect the sponsor rows currently in the DOM into a clean Sponsor[] (drops rows without a name). */
export function collectSponsors(root: ParentNode): Sponsor[] {
  return [...root.querySelectorAll('.pf-sprow')].map((r) => {
    const val = (sel: string) => (r.querySelector<HTMLInputElement>(sel)?.value ?? '').trim()
    return { name: val('.js-sp-name'), url: val('.js-sp-url'), tier: val('.js-sp-tier') }
  }).filter((s) => s.name).map((s) => ({ name: s.name, ...(s.url ? { url: s.url } : {}), ...(s.tier ? { tier: s.tier } : {}) }))
}

function form(site: OrgSiteDefaults | null): string {
  const v = site ?? {}
  const ve = v.venue ?? {}, co = v.contacts ?? {}
  const sponsors = (v.sponsors ?? []).map(sponsorRow).join('')
  return `<div id="err"></div>
    <div class="pf-card">
      <h2 class="pf-h3">Contenuti dell'organizzazione</h2>
      <p class="pf-muted">Questi contenuti vengono <b>ereditati da tutti gli eventi</b>. In ogni evento potrai sovrascriverli nel tab «Sito».</p>
      <div class="pf-field"><label>Chi siamo</label><textarea id="s-about" rows="4" placeholder="Racconta la tua organizzazione…">${esc(v.about ?? '')}</textarea></div>
    </div>
    <div class="pf-card">
      <h2 class="pf-h3">Sede abituale</h2>
      <div class="pf-field"><label>Nome</label><input id="s-venue-name" value="${esc(ve.name ?? '')}" placeholder="Es. Centro Sportivo Le Betulle" /></div>
      <div class="pf-field"><label>Indirizzo</label><input id="s-venue-address" value="${esc(ve.address ?? '')}" placeholder="Via …, Città" /></div>
      <div class="pf-field"><label>Link mappa</label><input id="s-venue-map" value="${esc(ve.mapUrl ?? '')}" placeholder="https://maps.google.com/…" /></div>
    </div>
    <div class="pf-card">
      <h2 class="pf-h3">Contatti</h2>
      <div class="pf-row" style="gap:var(--space-md)">
        <div class="pf-field" style="flex:1 1 auto"><label>Email</label><input id="s-c-email" value="${esc(co.email ?? '')}" placeholder="info@…" /></div>
        <div class="pf-field" style="flex:1 1 auto"><label>Telefono</label><input id="s-c-phone" value="${esc(co.phone ?? '')}" /></div>
        <div class="pf-field" style="flex:1 1 auto"><label>Social</label><input id="s-c-social" value="${esc(co.social ?? '')}" placeholder="@…" /></div>
      </div>
    </div>
    <div class="pf-card">
      <h2 class="pf-h3">Sponsor ricorrenti</h2>
      <div id="s-sponsors" class="pf-stack">${sponsors}</div>
      <button type="button" class="pf-btn pf-btn--ghost" id="s-sp-add" style="margin-top:var(--space-sm)">＋ Aggiungi sponsor</button>
    </div>
    <div class="pf-row" style="justify-content:flex-start"><button class="pf-btn pf-btn--primary" id="s-save">Salva</button></div>`
}

export function renderOrgSite(data: OrgSiteData): string {
  if (data.forbidden) return renderOrgShell('site', notAuthorizedCard('Sito organizzazione'))
  if (data.locked) return renderOrgShell('site', lockCard('Sito evento'))
  return renderOrgShell('site', `<div class="pf-pagehead"><div class="pf-eyebrow">Organizzazione</div><h1>Sito</h1></div>${form(data.site)}`)
}

export const orgSiteScreen: Screen<OrgSiteData> = {
  load: async (ctx) => {
    if (ctx.orgRole !== 'OWNER') return { site: null, forbidden: true }
    if (!ctx.entitlements.hasEventSite) return { site: null, locked: true }
    return { site: await ctx.client.o1.getSite(ctx.orgId).catch(() => null) }
  },
  render: (data) => renderOrgSite(data),
  mount(root, ctx: ViewCtx, data) {
    if (data.forbidden || data.locked) return
    const err = root.querySelector('#err')!
    const fail = (msg: string) => { err.innerHTML = inlineError(msg) }
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
    const val = (sel: string) => q<HTMLInputElement>(sel).value.trim()

    const sponsors = q('#s-sponsors')
    q<HTMLButtonElement>('#s-sp-add').addEventListener('click', () => sponsors.insertAdjacentHTML('beforeend', sponsorRow()))
    sponsors.addEventListener('click', (e) => {
      const del = (e.target as HTMLElement).closest('.js-sp-del')
      if (del) del.closest('.pf-sprow')?.remove()
    })

    q<HTMLButtonElement>('#s-save').addEventListener('click', async () => {
      const site: OrgSiteDefaults = {
        about: val('#s-about') || undefined,
        venue: { name: val('#s-venue-name') || undefined, address: val('#s-venue-address') || undefined, mapUrl: val('#s-venue-map') || undefined },
        contacts: { email: val('#s-c-email') || undefined, phone: val('#s-c-phone') || undefined, social: val('#s-c-social') || undefined },
        sponsors: collectSponsors(sponsors),
      }
      const btn = q<HTMLButtonElement>('#s-save'); btn.disabled = true
      try { await ctx.client.o1.setSite(ctx.orgId, site); ctx.refresh() }
      catch { fail('Salvataggio non riuscito. Riprova.'); btn.disabled = false }
    })
  },
}
