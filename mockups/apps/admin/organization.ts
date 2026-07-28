import { renderAdminTopbar } from '../../shared/chrome'
import { getOrganization, getEvents, setOrgStatus, setOrgModule, getSubscription, setSubscriptionPlan, setSubscriptionStatus } from '../../shared/mock/store'
import { PLANS, planPrice } from '../../shared/mock/plans'
import type { PlanKey, SubStatus } from '../../shared/mock/types'

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
    </div>
    ${(() => {
      const sub = getSubscription(id)
      if (!sub) return `<div class="pf-card pf-muted">Nessun abbonamento.</div>`
      const STATUS: Record<SubStatus, { label: string; cls: string }> = {
        TRIAL: { label: 'Trial', cls: 'pending' }, ACTIVE: { label: 'Attivo', cls: 'paid' }, PAST_DUE: { label: 'Insoluto', cls: 'unpaid' },
      }
      const st = STATUS[sub.status]
      return `<div class="pf-card">
        <h2>Abbonamento</h2>
        <div class="pf-field"><label>Piano</label>
          <select id="sub-plan">${PLANS.map(p => `<option value="${p.key}"${p.key === sub.plan ? ' selected' : ''}>${p.label}</option>`).join('')}</select></div>
        <div class="pf-field"><label>Stato</label>
          <select id="sub-status">
            <option value="TRIAL"${sub.status === 'TRIAL' ? ' selected' : ''}>Trial</option>
            <option value="ACTIVE"${sub.status === 'ACTIVE' ? ' selected' : ''}>Attivo</option>
            <option value="PAST_DUE"${sub.status === 'PAST_DUE' ? ' selected' : ''}>Insoluto</option>
          </select></div>
        <div class="pf-row">
          <span class="pf-badge pf-badge--${st.cls}">${st.label}</span>
          <span class="pf-mono">€${planPrice(sub.plan)}/mese · rinnovo ${sub.renewsOn}</span>
        </div>
      </div>`
    })()}`
  document.getElementById('togglestatus')!.addEventListener('click', () => { setOrgStatus(id, active ? 'SUSPENDED' : 'ACTIVE'); render() })
  document.querySelectorAll<HTMLInputElement>('.js-mod').forEach(cb =>
    cb.addEventListener('change', () => { setOrgModule(id, cb.dataset.key!, cb.checked); render() }))
  const planSel = document.getElementById('sub-plan') as HTMLSelectElement | null
  if (planSel) planSel.addEventListener('change', () => { setSubscriptionPlan(id, planSel.value as PlanKey); render() })
  const statusSel = document.getElementById('sub-status') as HTMLSelectElement | null
  if (statusSel) statusSel.addEventListener('change', () => { setSubscriptionStatus(id, statusSel.value as SubStatus); render() })
}
render()
