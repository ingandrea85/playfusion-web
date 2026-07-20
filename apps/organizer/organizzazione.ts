import { renderOrganizerWorkspace } from '../../shared/chrome'
import { getCurrentOrgId, getEvents, getEvent, getBrand, setBrand, hasModule } from '../../shared/mock/store'

const eventId = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const orgId = getCurrentOrgId()
const ev = getEvent(eventId) ?? getEvents().find(e => e.organizationId === orgId)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'settings')

const body = document.getElementById('body')!
if (!hasModule(orgId, 'M-Broadcast')) {
  body.innerHTML = `<div class="pf-card"><h2>🔒 Brand personalizzato — richiede Pro</h2>
    <p class="pf-muted">Con il piano Free il tuo torneo usa il brand PlayFusion. Passa a Pro per usare logo e colori tuoi.</p>
    <a class="pf-btn pf-btn--primary" href="/apps/organizer/abbonamento.html">Passa a Pro</a></div>`
} else {
  const b = getBrand(orgId)
  const cur = { logoText: b?.logoText ?? 'playfusion', primaryColor: b?.primaryColor ?? '#0b5fff', accentColor: b?.accentColor ?? '#ff6b00' }
  body.innerHTML = `<div class="pf-card">
    <div class="pf-field"><label>Logo (testo)</label><input id="b-logo" value="${cur.logoText}" /></div>
    <div class="pf-row" style="gap:var(--space-4)">
      <div class="pf-field"><label>Colore primario</label><input id="b-primary" type="color" value="${cur.primaryColor}" /></div>
      <div class="pf-field"><label>Colore accent</label><input id="b-accent" type="color" value="${cur.accentColor}" /></div>
    </div>
    <div class="pf-card" id="preview" style="margin-top:var(--space-3)"></div>
    <div class="pf-row" style="gap:var(--space-2);margin-top:var(--space-3)">
      <button class="pf-btn pf-btn--primary" id="b-save">Salva</button>
      <button class="pf-btn" id="b-reset">Ripristina default</button>
    </div>
  </div>`
  const logo = () => (document.getElementById('b-logo') as HTMLInputElement).value
  const primary = () => (document.getElementById('b-primary') as HTMLInputElement).value
  const accent = () => (document.getElementById('b-accent') as HTMLInputElement).value
  function preview(): void {
    document.getElementById('preview')!.innerHTML = `<div class="pf-eyebrow">Anteprima</div>
      <div style="font-family:var(--font-display);font-weight:800;font-size:22px;margin:6px 0">${logo()}</div>
      <button class="pf-btn" style="background:${accent()};color:#fff;border-color:transparent">Bottone primario</button>
      <span class="pf-badge" style="background:${primary()};color:#fff">Accent</span>`
  }
  preview()
  ;['b-logo', 'b-primary', 'b-accent'].forEach(idp => document.getElementById(idp)!.addEventListener('input', preview))
  document.getElementById('b-save')!.addEventListener('click', () => {
    setBrand(orgId, { logoText: logo().trim() || 'playfusion', primaryColor: primary(), accentColor: accent() })
    location.reload()
  })
  document.getElementById('b-reset')!.addEventListener('click', () => {
    setBrand(orgId, { logoText: 'playfusion', primaryColor: '#0b5fff', accentColor: '#ff6b00' })
    location.reload()
  })
}
