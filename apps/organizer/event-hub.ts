import { renderOrganizerWorkspace, renderCalendar } from '../../shared/chrome'
import { decideMatch } from '../../shared/mock/derive'
import {
  getEvent, getRegistrations, getCategories, getCompetitions, getSchedule, getGroupSlots,
  getScheduledMatches, getFinals,
  getEventPhase, getPendingActions, getNextMatches, getLastResults, getGroupLeaders,
} from '../../shared/mock/store'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const event = getEvent(id)
if (!event) {
  document.getElementById('body')!.innerHTML = `<p class="pf-muted">Evento non trovato.</p>`
} else {
  document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(event, 'overview')
  const catName = (c: string) => getCategories(id).find(x => x.id === c)?.name ?? '—'
  const body = document.getElementById('body')!
  const phase = getEventPhase(id)
  if (phase === 'PREP') body.innerHTML = renderPrep()
  else if (phase === 'LIVE') body.innerHTML = renderLive()
  else body.innerHTML = renderDone()

  function renderPrep(): string {
    const regs = getRegistrations(id)
    const cats = getCategories(id); const comps = getCompetitions(id)
    const pb2 = event!.playbook === 'PB-2'
    const schedStatus = getSchedule(id)?.status ?? 'NONE'
    const gironiComposed = cats.length > 0 && cats.every(c => getGroupSlots(id).some(s => s.categoryId === c.id))
    const competitionConfigured = cats.length > 0 && cats.every(c => comps.some(k => k.categoryId === c.id))
    const steps: Array<{ label: string; href?: string; done: boolean }> = [
      { label: 'Crea evento da template', done: true },
      { label: 'Configura categorie', href: `/apps/organizer/categories.html?event=${id}`, done: true },
      ...(pb2
        ? [{ label: 'Inserisci squadre', href: `/apps/organizer/teams.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') }]
        : [
            { label: 'Apri iscrizioni', href: `/apps/organizer/registrations.html?event=${id}`, done: !!event!.registrationsOpen },
            { label: 'Conferma squadre', href: `/apps/organizer/inbox.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') },
            { label: 'Riscuoti quote', href: `/apps/organizer/payments.html?event=${id}`, done: regs.some(r => r.paymentStatus === 'PAID') },
          ]),
      { label: 'Configura competizione', href: `/apps/organizer/competition.html?event=${id}`, done: competitionConfigured },
      { label: 'Componi gironi', href: `/apps/organizer/gironi.html?event=${id}`, done: gironiComposed },
      { label: 'Genera calendario', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus !== 'NONE' },
      { label: 'Approva e pubblica', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus === 'PUBLISHED' },
    ]
    const doneN = steps.filter(s => s.done).length
    const pct = Math.round((doneN / steps.length) * 100)
    const rows = steps.map(s => `<li data-done="${s.done}">${s.href ? `<a href="${s.href}">${s.label}</a>` : `<span>${s.label}</span>`}</li>`).join('')
    return `<div class="pf-card"><h2>Prossimi passi</h2>
      <div style="height:8px;background:#e2e8f0;border-radius:99px;margin:8px 0"><div style="width:${pct}%;height:8px;background:var(--color-action-primary);border-radius:99px"></div></div>
      <div class="pf-muted" style="margin-bottom:var(--space-3)">Setup ${pct}%</div>
      <ol class="pf-steplist">${rows}</ol></div>
      <div class="pf-card pf-muted">${regs.length} iscrizioni · ${regs.filter(r => r.status !== 'CONFIRMED').length} da confermare · ${cats.length} categorie</div>`
  }

  function renderLive(): string {
    const p = getPendingActions(id)
    const todo: string[] = []
    if (p.notPublished) todo.push(`<li><a href="/apps/organizer/schedule.html?event=${id}">Pubblica il calendario</a></li>`)
    if (p.missingResults) todo.push(`<li><a href="/apps/organizer/schedule.html?event=${id}">${p.missingResults} risultati da inserire</a></li>`)
    if (p.unresolvedTies) todo.push(`<li><a href="/apps/organizer/classifiche.html?event=${id}">${p.unresolvedTies} parità da risolvere</a></li>`)
    if (p.unpaid) todo.push(`<li><a href="/apps/organizer/payments.html?event=${id}">${p.unpaid} quote non pagate</a></li>`)
    const todoCard = todo.length ? `<div class="pf-card"><h2>Da fare ora</h2><ul class="pf-todo">${todo.join('')}</ul></div>` : ''
    const next = getNextMatches(id, 5)
    const nextCard = `<div class="pf-card"><h2>Prossime partite</h2>${next.length ? renderCalendar(next, catName) : '<p class="pf-muted">Nessuna partita in programma.</p>'}</div>`
    const last = getLastResults(id, 5)
    const lastCard = `<div class="pf-card"><h2>Ultimi risultati</h2>${last.length ? renderCalendar(last, catName) : '<p class="pf-muted">Ancora nessun risultato.</p>'}</div>`
    const leaders = getGroupLeaders(id)
    const leadCard = `<div class="pf-card"><h2>Classifiche in breve</h2>${leaders.length
      ? `<ul class="pf-roster">${leaders.map(l => `<li class="pf-rosterrow"><span class="pf-mono pf-muted">${catName(l.categoryId)} · ${l.groupLabel}</span><span class="pf-rosterrow__name">${l.team}</span></li>`).join('')}</ul>
         <a class="pf-btn" href="/apps/organizer/classifiche.html?event=${id}" style="margin-top:var(--space-3)">Vedi classifiche →</a>`
      : '<p class="pf-muted">Classifiche non disponibili.</p>'}</div>`
    return todoCard + nextCard + lastCard + leadCard
  }

  function renderDone(): string {
    const champs = getFinals(id).filter(f => f.round === 'Finale').map(f => {
      const d = decideMatch(f); return d ? `<li class="pf-rosterrow"><span class="pf-mono pf-muted">${catName(f.categoryId)} · ${f.bracketLabel}</span><span class="pf-rosterrow__name">🏆 ${d.winner}</span></li>` : ''
    }).join('')
    const played = getScheduledMatches(id).filter(m => m.homeScore !== null).length
    return `<div class="pf-card"><h2>Campioni</h2>${champs ? `<ul class="pf-roster">${champs}</ul>` : '<p class="pf-muted">Nessun campione decretato.</p>'}</div>
      <div class="pf-card pf-muted">${played} partite giocate · ${getRegistrations(id).filter(r => r.status === 'CONFIRMED').length} squadre</div>`
  }
}
