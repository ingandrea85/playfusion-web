import { esc } from '@playfusion/app-shell'
import type { AdminOrgSummary, Subscription } from '@playfusion/rest-client'

export interface OrgRow extends AdminOrgSummary { sub?: Subscription | null }

/** Plan badge label from a subscription (or "—" when unknown). */
export function planLabel(sub?: Subscription | null): string {
  if (!sub) return '—'
  if (sub.status === 'TRIAL') return `Prova Pro · ${sub.trialDaysLeft}g`
  return sub.plan === 'FREE' ? 'Free' : sub.plan === 'BUSINESS' ? 'Business' : 'Pro'
}
const planMod = (sub?: Subscription | null): string =>
  !sub ? '' : sub.status === 'TRIAL' ? 'trial' : sub.plan.toLowerCase()

export function renderOrganizations(rows: OrgRow[]): string {
  const body = rows.length
    ? rows.map((r) => `<tr>
        <td><a href="#/organizations/${encodeURIComponent(r.id)}"><b>${esc(r.name)}</b></a><br><span class="pf-mono pf-muted">${esc(r.id)}</span></td>
        <td><span class="pf-badge pf-plan--${planMod(r.sub)}">${esc(planLabel(r.sub))}</span></td>
        <td>${r.memberCount}</td>
        <td><a class="pf-btn pf-btn--ghost" href="#/organizations/${encodeURIComponent(r.id)}">Apri →</a></td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="pf-muted">Nessuna organizzazione.</td></tr>`
  return `<main class="pf-container">
    <div class="pf-pagehead"><div class="pf-eyebrow">Admin</div><h1>Organizzazioni</h1></div>
    <div class="pf-card" style="padding:0;overflow-x:auto">
      <table class="pf-table">
        <thead><tr><th>Organizzazione</th><th>Piano</th><th>Membri</th><th></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </main>`
}
