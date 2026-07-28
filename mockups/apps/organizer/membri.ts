import { renderOrganizerWorkspace, requireRole } from '../../shared/chrome'
import {
  getCurrentOrgId, getEvents, getEvent, getSession,
  listMembers, listInvitations, inviteMember, acceptInvitation, revokeInvitation,
  changeMemberRole, removeMember, isLastOwner,
} from '../../shared/mock/store'
import { roleLabel } from '../../shared/mock/roles'
import type { OrgRole } from '../../shared/mock/types'

// Owner-only page.
if (requireRole(['OWNER'])) {
  const eventId = new URLSearchParams(location.search).get('event') ?? 'evt-1'
  const orgId = getCurrentOrgId()
  const ev = getEvent(eventId) ?? getEvents().find(e => e.organizationId === orgId)
  if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'settings')

  const ROLES: OrgRole[] = ['OWNER', 'ORGANIZER', 'DIRECTOR']
  const roleClass = (r: OrgRole) => ({ OWNER: 'own', ORGANIZER: 'org', DIRECTOR: 'dir' }[r])
  const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const flash = (msg: string) => { document.getElementById('flash')!.innerHTML = `<div class="pf-flash">✓ ${msg}</div>` }

  function renderMembers(): void {
    const me = getSession()?.userId
    const members = listMembers(orgId)
    document.getElementById('members')!.innerHTML = members.map(m => {
      const last = isLastOwner(orgId, m.id)
      const roleSel = `<select class="pf-rolesel" data-user="${m.id}"${last ? ' disabled' : ''}>${
        ROLES.map(r => `<option value="${r}"${r === m.role ? ' selected' : ''}>${roleLabel(r)}</option>`).join('')}</select>`
      const rm = `<button class="pf-btn pf-btn--ghost js-rm" data-user="${m.id}"${last ? ' disabled' : ''}>Rimuovi</button>`
      return `<div class="pf-memberrow">
        <span class="pf-avatar pf-avatar--${roleClass(m.role)}">${initials(m.name)}</span>
        <span class="pf-member__id"><b>${m.name}</b>${m.id === me ? ' <em class="pf-muted">— sei tu</em>' : ''}<br><span class="pf-muted pf-mono">${m.email}</span></span>
        <span class="pf-rolebadge pf-rolebadge--${roleClass(m.role)}">${roleLabel(m.role)}</span>
        <span class="pf-member__act">${roleSel}${rm}</span>
      </div>`
    }).join('')
    document.querySelectorAll<HTMLSelectElement>('.pf-rolesel').forEach(sel =>
      sel.addEventListener('change', () => {
        if (!changeMemberRole(sel.dataset.user!, sel.value as OrgRole)) { flash('Serve almeno un Owner'); render(); return }
        flash('Ruolo aggiornato'); render()
      }))
    document.querySelectorAll<HTMLButtonElement>('.js-rm').forEach(b =>
      b.addEventListener('click', () => {
        if (!removeMember(b.dataset.user!)) { flash('Serve almeno un Owner'); return }
        flash('Membro rimosso'); render()
      }))
  }

  function renderInvites(): void {
    const invites = listInvitations(orgId).filter(i => i.status === 'PENDING')
    const el = document.getElementById('invites')!
    if (!invites.length) { el.innerHTML = `<p class="pf-muted">Nessun invito in sospeso.</p>`; return }
    el.innerHTML = invites.map(i => `<div class="pf-memberrow pf-memberrow--invite">
        <span class="pf-avatar pf-avatar--pending">?</span>
        <span class="pf-member__id"><b>${i.name}</b><br><span class="pf-muted pf-mono">${i.email} · …/invito/${i.id}</span></span>
        <span class="pf-rolebadge pf-rolebadge--${roleClass(i.role)}">${roleLabel(i.role)}</span>
        <span class="pf-member__act">
          <button class="pf-btn pf-btn--primary js-accept" data-inv="${i.id}">▶ Simula accettazione</button>
          <button class="pf-btn pf-btn--ghost js-revoke" data-inv="${i.id}">Revoca</button>
        </span>
      </div>`).join('')
    document.querySelectorAll<HTMLButtonElement>('.js-accept').forEach(b =>
      b.addEventListener('click', () => { acceptInvitation(b.dataset.inv!); flash('Invito accettato'); render() }))
    document.querySelectorAll<HTMLButtonElement>('.js-revoke').forEach(b =>
      b.addEventListener('click', () => { revokeInvitation(b.dataset.inv!); flash('Invito revocato'); render() }))
  }

  function renderForm(): void {
    document.getElementById('inviteform')!.innerHTML = `
      <div class="pf-row" style="align-items:flex-end;gap:var(--space-3);flex-wrap:wrap">
        <div class="pf-field" style="margin-bottom:0"><label>Nome</label><input id="inv-name" placeholder="Nome e cognome" /></div>
        <div class="pf-field" style="margin-bottom:0"><label>Email</label><input id="inv-email" type="email" placeholder="email@esempio.it" /></div>
        <div class="pf-field" style="margin-bottom:0"><label>Ruolo</label><select id="inv-role">${
          ROLES.map(r => `<option value="${r}"${r === 'ORGANIZER' ? ' selected' : ''}>${roleLabel(r)}</option>`).join('')}</select></div>
        <button class="pf-btn pf-btn--primary" id="inv-send">Invia invito</button>
      </div>`
    document.getElementById('inv-send')!.addEventListener('click', () => {
      const name = (document.getElementById('inv-name') as HTMLInputElement).value.trim()
      const email = (document.getElementById('inv-email') as HTMLInputElement).value.trim()
      const role = (document.getElementById('inv-role') as HTMLSelectElement).value as OrgRole
      if (!name || !email) { flash('Nome ed email sono obbligatori'); return }
      inviteMember(orgId, { name, email, role })
      flash('Invito creato'); render()
    })
  }

  function render(): void { renderMembers(); renderInvites(); renderForm() }
  render()
}
