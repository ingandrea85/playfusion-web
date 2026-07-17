import { renderAdminTopbar } from '../../shared/chrome'
import { getOrganization, getEvents, setOrgStatus, setOrgModule } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderAdminTopbar()
const id = new URLSearchParams(location.search).get('org') ?? 'org-1'

const MODULES: Array<{ key: string; label: string }> = [
  { key: 'M-Core', label: 'Core' }, { key: 'M-Compete', label: 'Compete' }, { key: 'M-Broadcast', label: 'Broadcast' },
  { key: 'M-Payments', label: 'Payments' }, { key: 'M-Billing', label: 'Billing' },
]

function render(): void {
  const o = getOrganization(id)
  const content = document.getElementById('content')!
  if (!o) { content.innerHTML = `<div class="pf-card pf-muted">Organizzazione non trovata.</div>`; return }
  const active = o.status === 'ACTIVE'
  const events = getEvents().filter(e => e.organizationId === o.id).length
  content.innerHTML = `
    <div class="pf-pagehead"><div class="pf-eyebrow">Tenant</div><h1>${o.name}</h1></div>
    <div class="pf-card">
      <div class="pf-row">
        <span class="pf-badge pf-badge--${active ? 'paid' : 'unpaid'}">${active ? 'Attiva' : 'Sospesa'}</span>
        <button class="pf-btn pf-btn--primary" id="togglestatus">${active ? 'Sospendi' : 'Riattiva'}</button>
      </div>
      <p class="pf-mono" style="margin-top:var(--space-3)">${events} ${events === 1 ? 'evento' : 'eventi'}</p>
    </div>
    <div class="pf-card">
      <h2>Moduli</h2>
      ${MODULES.map(m => `<label class="pf-switch" style="display:flex;margin:var(--space-2) 0">
        <input type="checkbox" class="js-mod" data-key="${m.key}" ${o.modules.includes(m.key) ? 'checked' : ''} ${m.key === 'M-Core' ? 'disabled' : ''} /> ${m.label}${m.key === 'M-Core' ? ' (sempre attivo)' : ''}
      </label>`).join('')}
    </div>`
  document.getElementById('togglestatus')!.addEventListener('click', () => { setOrgStatus(id, active ? 'SUSPENDED' : 'ACTIVE'); render() })
  document.querySelectorAll<HTMLInputElement>('.js-mod').forEach(cb =>
    cb.addEventListener('change', () => { setOrgModule(id, cb.dataset.key!, cb.checked); render() }))
}
render()
