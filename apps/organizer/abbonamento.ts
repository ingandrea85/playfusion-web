import { renderOrganizerWorkspace } from '../../shared/chrome'
import { getCurrentOrgId, getSubscription, getEvents, planOf, activatePro } from '../../shared/mock/store'
import { PLANS, planLabel } from '../../shared/mock/plans'

const orgId = getCurrentOrgId()
// The shell needs an event; use the org's first event if any, else a synthetic header-less fallback.
const anyEvent = getEvents().find(e => e.organizationId === orgId)
if (anyEvent) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(anyEvent, 'settings')

function render(): void {
  const sub = getSubscription(orgId)
  const cur = planOf(orgId)
  document.getElementById('title')!.textContent = `Il tuo piano · ${planLabel(cur)}${sub?.status === 'TRIAL' ? ' (in prova)' : ''}`
  document.getElementById('plans')!.innerHTML = PLANS.map(p => {
    const active = p.key === cur
    const feats = p.key === 'FREE' ? '1 evento attivo · funzioni base'
      : p.key === 'PRO' ? 'Eventi illimitati · portale pubblico · pagamenti quote'
      : 'Tutto Pro · supporto dedicato'
    const cta = active ? `<span class="pf-badge pf-badge--paid">Piano attuale</span>`
      : p.key === 'PRO' ? `<button class="pf-btn pf-btn--primary" id="buy-pro">Attiva Pro</button>`
      : p.key === 'BUSINESS' ? `<a class="pf-btn" href="#" onclick="return false">Contattaci</a>`
      : ''
    return `<div class="pf-card"${p.key === 'PRO' ? ' style="border-color:var(--color-action-primary)"' : ''}>
      <div class="pf-eyebrow">${planLabel(p.key)}${p.priceMonthly ? ` · €${p.priceMonthly}/mese` : ' · gratis'}</div>
      <p class="pf-muted">${feats}</p>${cta}</div>`
  }).join('')
  const buy = document.getElementById('buy-pro')
  if (buy) buy.addEventListener('click', () => {
    // Fake payment
    activatePro(orgId)
    document.getElementById('flash')!.innerHTML = `<div class="pf-flash">✓ Pro attivato — grazie!</div>`
    render()
  })
}
render()
