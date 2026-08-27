import { esc } from '@playfusion/app-shell'
import type { Invitation, Member, OrgRole } from '@playfusion/rest-client'
import { inlineError, lockCard, type Screen, type ViewCtx } from '../view.js'
import { renderOrgShell } from './org.js'

export interface MembersData { members: Member[]; invitations: Invitation[]; locked?: boolean }

// Two membership roles: directors enter via magic link, not org membership (T3).
const ROLES: OrgRole[] = ['OWNER', 'ORGANIZER']
const ROLE_LABEL: Record<OrgRole, string> = { OWNER: 'Owner', ORGANIZER: 'Organizer' }
const roleBadge = (role: OrgRole): string => `<span class="pf-role pf-role--${role.toLowerCase()}">${ROLE_LABEL[role]}</span>`
const roleOptions = (sel: OrgRole): string => ROLES.map((r) => `<option value="${r}"${r === sel ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')

/** The only OWNER (if exactly one) — its role select + remove are locked to keep >=1 owner. */
export function lastOwnerId(members: Member[]): string | null {
  const owners = members.filter((m) => m.role === 'OWNER')
  return owners.length === 1 ? owners[0]!.memberId : null
}

function membersCard(members: Member[]): string {
  const lock = lastOwnerId(members)
  if (!members.length) return `<div class="pf-card"><h2 class="pf-h3">Membri attivi</h2><p class="pf-muted">Nessun membro ancora. Invita qualcuno qui sotto.</p></div>`
  const rows = members.map((m) => {
    const locked = m.memberId === lock
    return `<li class="pf-row" style="justify-content:space-between;gap:var(--space-md);align-items:center">
      <span><b>${esc(m.name)}</b> ${roleBadge(m.role)}<br><span class="pf-muted">${esc(m.email)}</span></span>
      <span class="pf-row" style="gap:var(--space-sm);flex:0 0 auto">
        <select class="js-role" data-id="${esc(m.memberId)}"${locked ? ' disabled title="Un\'organizzazione deve mantenere almeno un owner"' : ''}>${roleOptions(m.role)}</select>
        <button class="pf-btn pf-btn--ghost" data-remove="${esc(m.memberId)}"${locked ? ' disabled' : ''}>Rimuovi</button>
      </span>
    </li>`
  }).join('')
  return `<div class="pf-card"><h2 class="pf-h3">Membri attivi</h2><ul class="pf-stack" style="list-style:none;padding:0;margin:0">${rows}</ul></div>`
}

function invitationsCard(invitations: Invitation[]): string {
  const pending = invitations.filter((i) => i.status === 'PENDING')
  if (!pending.length) return ''
  const rows = pending.map((i) => `<li class="pf-row" style="justify-content:space-between;gap:var(--space-md);align-items:center">
    <span><b>${esc(i.name)}</b> ${roleBadge(i.role)}<br><span class="pf-muted">${esc(i.email)}</span></span>
    <span class="pf-row" style="gap:var(--space-sm);flex:0 0 auto">
      <button class="pf-btn pf-btn--ghost" data-revoke="${esc(i.invitationId)}">Revoca</button>
    </span>
  </li>`).join('')
  return `<div class="pf-card"><h2 class="pf-h3">Inviti in sospeso</h2><p class="pf-muted" style="margin:0 0 var(--space-sm)">L'invitato riceve un'email da Auth0 e diventa membro accettando.</p><ul class="pf-stack" style="list-style:none;padding:0;margin:0">${rows}</ul></div>`
}

export function renderMembers(data: MembersData): string {
  if (data.locked) return renderOrgShell('members', lockCard('Gestione membri'))
  const body = `<div class="pf-pagehead"><div class="pf-eyebrow">Organizzazione</div><h1>Membri</h1></div><div id="err"></div>
    ${membersCard(data.members)}
    ${invitationsCard(data.invitations)}
    <div class="pf-card">
      <h2 class="pf-h3">Invita un membro</h2>
      <div class="pf-field"><label>Nome</label><input id="i-name" placeholder="Es. Marco Rossi" /></div>
      <div class="pf-field"><label>Email</label><input id="i-email" type="email" placeholder="marco@example.com" /></div>
      <div class="pf-row" style="align-items:flex-end;gap:var(--space-md)">
        <div class="pf-field" style="margin-bottom:0;min-width:180px"><label>Ruolo</label><select id="i-role">${roleOptions('ORGANIZER')}</select></div>
        <button class="pf-btn pf-btn--primary" id="i-invite">Invita</button>
      </div>
      <p class="pf-muted" style="margin-top:var(--space-sm)">L'invito parte via email (Auth0): il membro entra nell'organizzazione accettando. I direttori invece accedono col link magico, non da qui.</p>
    </div>`
  return renderOrgShell('members', body)
}

export const membersScreen: Screen<MembersData> = {
  load: async (ctx) => ({
    members: await ctx.client.o2.listMembers(ctx.orgId).catch(() => [] as Member[]),
    invitations: await ctx.client.o2.listInvitations(ctx.orgId).catch(() => [] as Invitation[]),
    locked: !ctx.entitlements.canInviteMembers,
  }),
  render: (data) => renderMembers(data),
  mount(root, ctx: ViewCtx, data) {
    if (data.locked) return // plan-gated
    const err = root.querySelector('#err')!
    const fail = (msg: string) => { err.innerHTML = inlineError(msg) }
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!

    q<HTMLButtonElement>('#i-invite').addEventListener('click', async () => {
      const name = q<HTMLInputElement>('#i-name').value.trim()
      const email = q<HTMLInputElement>('#i-email').value.trim()
      const role = q<HTMLSelectElement>('#i-role').value as OrgRole
      if (!name || !email) { fail('Inserisci nome ed email.'); return }
      const btn = q<HTMLButtonElement>('#i-invite'); btn.disabled = true
      try { await ctx.client.o2.inviteMember(ctx.orgId, { name, email, role }); ctx.refresh() }
      catch { fail('Invito non riuscito. Riprova.'); btn.disabled = false }
    })

    root.querySelectorAll<HTMLSelectElement>('.js-role').forEach((sel) => sel.addEventListener('change', async () => {
      try { await ctx.client.o2.changeMemberRole(ctx.orgId, sel.dataset.id!, sel.value as OrgRole); ctx.refresh() }
      catch (e: any) { fail(e?.status === 409 ? 'Un\'organizzazione deve mantenere almeno un owner.' : 'Cambio ruolo non riuscito.'); ctx.refresh() }
    }))
    root.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Rimuovere il membro?')) return
      try { await ctx.client.o2.removeMember(ctx.orgId, b.dataset.remove!); ctx.refresh() }
      catch (e: any) { fail(e?.status === 409 ? 'Un\'organizzazione deve mantenere almeno un owner.' : 'Rimozione non riuscita.') }
    }))
    root.querySelectorAll<HTMLButtonElement>('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Revocare l\'invito?')) return
      try { await ctx.client.o2.revokeInvitation(ctx.orgId, b.dataset.revoke!); ctx.refresh() }
      catch { fail('Revoca non riuscita. Riprova.') }
    }))
  },
}
