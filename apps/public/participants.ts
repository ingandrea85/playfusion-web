import { renderPublicTopbar, applyOrgBrand } from '../../shared/chrome'
import { getCategories, getEvent, getRegistrations } from '../../shared/mock/store'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const brandLogo = applyOrgBrand(getEvent(id)?.organizationId ?? 'org-1')
document.getElementById('topbar')!.innerHTML = renderPublicTopbar(brandLogo ?? undefined)
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const cats = getCategories(id)
const confirmed = getRegistrations(id).filter(r => r.status === 'CONFIRMED')

document.getElementById('list')!.innerHTML = cats.map(c => {
  const teams = confirmed.filter(r => r.categoryId === c.id)
  const body = teams.length
    ? `<ul class="pf-teamlist">${teams.map(t =>
        `<li class="pf-team"><span class="pf-team__badge">${initials(t.teamName)}</span><span class="pf-team__name">${t.teamName}</span></li>`).join('')}</ul>`
    : `<p class="pf-muted">Ancora nessuna squadra confermata.</p>`
  return `<div class="pf-teamgroup">
    <div class="pf-teamgroup__head">
      <span class="pf-cat__label">${c.name}</span>
      <span class="pf-mono">${teams.length} ${teams.length === 1 ? 'squadra confermata' : 'squadre confermate'}</span>
    </div>
    ${body}
  </div>`
}).join('')
