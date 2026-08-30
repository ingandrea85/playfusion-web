import { esc } from '@playfusion/app-shell'
import type { AdminOrgDetail, Subscription, EventSummary, Member, PlanKey } from '@playfusion/rest-client'
import { planLabel } from './organizations.js'

export interface OrgDetailData { detail: AdminOrgDetail; sub: Subscription | null; events: EventSummary[] }

const roleLabel = (role: Member['role']): string => (role === 'OWNER' ? 'Owner' : 'Organizer')

function membersCard(members: Member[]): string {
  const rows = members.length
    ? members.map((m) => `<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.email)}</td><td><span class="pf-badge">${roleLabel(m.role)}</span></td></tr>`).join('')
    : `<tr><td colspan="3" class="pf-muted">Nessun membro.</td></tr>`
  return `<div class="pf-card"><h2 class="pf-h3">Membri (${members.length})</h2>
    <table class="pf-table"><thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

function eventsCard(events: EventSummary[]): string {
  const rows = events.length
    ? events.map((e) => `<tr><td><b>${esc(e.name ?? e.sport)}</b></td><td>${esc(e.categorie.join(', '))}</td><td class="pf-mono">${esc(e.dates.from)} → ${esc(e.dates.to)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="pf-muted">Nessun evento.</td></tr>`
  return `<div class="pf-card"><h2 class="pf-h3">Eventi (${events.length})</h2>
    <table class="pf-table"><thead><tr><th>Nome</th><th>Categorie</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

function subscriptionCard(sub: Subscription | null): string {
  const line = sub
    ? `<p><span class="pf-badge">${esc(planLabel(sub))}</span> ${sub.status === 'TRIAL' ? `prova · ${sub.trialDaysLeft} giorni rimasti` : `rinnovo ${esc(sub.renewsOn)}`}</p>`
    : `<p class="pf-muted">Nessuna sottoscrizione (mai provisionata).</p>`
  return `<div class="pf-card"><div id="err"></div>
    <h2 class="pf-h3">Sottoscrizione</h2>${line}
    <div class="pf-eyebrow" style="margin-top:var(--space-md)">Imposta piano</div>
    <div class="pf-row" style="gap:var(--space-sm);margin-top:var(--space-sm);flex-wrap:wrap">
      <button class="pf-btn pf-btn--ghost" data-plan="FREE">Free</button>
      <button class="pf-btn pf-btn--ghost" data-plan="PRO">Pro</button>
      <button class="pf-btn pf-btn--ghost" data-plan="BUSINESS">Business</button>
      <button class="pf-btn pf-btn--ghost" data-trial="1">Concedi prova Pro</button>
    </div>
  </div>`
}

export function renderOrganization(data: OrgDetailData): string {
  return `<main class="pf-container">
    <div class="pf-pagehead"><a class="pf-eyebrow" href="#/">← Organizzazioni</a><h1>${esc(data.detail.name)}</h1>
      <div class="pf-mono pf-muted">${esc(data.detail.id)}</div></div>
    ${subscriptionCard(data.sub)}
    ${membersCard(data.detail.members)}
    ${eventsCard(data.events)}
  </main>`
}

/** Wire the plan-action buttons: set plan / grant trial → o11 admin → onDone(refresh). */
export function wireOrganization(root: ParentNode, orgId: string, api: {
  setPlan(orgId: string, input: { plan: PlanKey; trial?: boolean }): Promise<unknown>
  fail(msg: string): void
  onDone(): void
}): void {
  const run = async (input: { plan: PlanKey; trial?: boolean }, btn: HTMLButtonElement) => {
    btn.disabled = true
    try { await api.setPlan(orgId, input); api.onDone() }
    catch { api.fail('Operazione non riuscita. Riprova.'); btn.disabled = false }
  }
  root.querySelectorAll<HTMLButtonElement>('[data-plan]').forEach((b) =>
    b.addEventListener('click', () => run({ plan: b.dataset.plan as PlanKey }, b)))
  root.querySelectorAll<HTMLButtonElement>('[data-trial]').forEach((b) =>
    b.addEventListener('click', () => run({ plan: 'PRO', trial: true }, b)))
}
