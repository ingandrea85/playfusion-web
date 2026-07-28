import { renderAdminTopbar } from '../../shared/chrome'
import { getOrganizations, getEvents } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderAdminTopbar()

const MODULE_LABELS: Record<string, string> = { 'M-Core': 'Core', 'M-Compete': 'Compete', 'M-Broadcast': 'Broadcast', 'M-Payments': 'Payments', 'M-Billing': 'Billing' }
const statusBadge = (s: string) => s === 'ACTIVE'
  ? `<span class="pf-badge pf-badge--paid">Attiva</span>`
  : `<span class="pf-badge pf-badge--unpaid">Sospesa</span>`

document.getElementById('list')!.innerHTML = getOrganizations().map(o => {
  const events = getEvents().filter(e => e.organizationId === o.id).length
  const chips = o.modules.map(m => `<li class="pf-chip">${MODULE_LABELS[m] ?? m}</li>`).join('')
  return `<a class="pf-card pf-card--link" style="display:block;text-decoration:none;color:inherit" href="/apps/admin/organization.html?org=${o.id}">
    <div class="pf-row"><h2 style="margin:0">${o.name}</h2>${statusBadge(o.status)}</div>
    <ul class="pf-chips" style="margin:var(--space-3) 0">${chips}</ul>
    <div class="pf-mono">${events} ${events === 1 ? 'evento' : 'eventi'}</div>
  </a>`
}).join('')
