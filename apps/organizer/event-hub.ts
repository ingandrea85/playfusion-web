import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvent, getRegistrations, getCategories, getCompetitions, getSchedule, getGroupSlots } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const event = getEvent(id)
document.getElementById('title')!.textContent = event ? event.name : 'Evento non trovato'
document.getElementById('meta')!.textContent = event
  ? `${event.sport} · ${event.location} · ${event.startDate} ${event.startTime}→${event.endDate}` : ''

const regs = event ? getRegistrations(id) : []
const anyPaid = regs.some(r => r.paymentStatus === 'PAID')

const cats = getCategories(id)
const comps = getCompetitions(id)
const competitionConfigured = cats.length > 0 && cats.every(c => comps.some(k => k.categoryId === c.id))
const gironiComposed = cats.length > 0 && cats.every(c => getGroupSlots(id).some(s => s.categoryId === c.id))
const schedStatus = getSchedule(id)?.status ?? 'NONE'

type Step = { label: string; href?: string; done: boolean; disabled?: boolean }
const pb2 = event?.playbook === 'PB-2'
document.getElementById('setup-title')!.textContent = `Setup — ${event?.playbook ?? 'PB-1'}`
const rosterSteps: Step[] = pb2
  ? [{ label: 'Inserisci squadre', href: `/apps/organizer/teams.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') }]
  : [
      { label: 'Apri iscrizioni', href: `/apps/organizer/registrations.html?event=${id}`, done: !!event?.registrationsOpen },
      { label: 'Conferma squadre', href: `/apps/organizer/inbox.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') },
      { label: 'Riscuoti quote', href: `/apps/organizer/payments.html?event=${id}`, done: anyPaid },
    ]
const steps: Step[] = [
  { label: 'Crea evento da template', done: !!event },
  { label: 'Configura categorie', href: `/apps/organizer/categories.html?event=${id}`, done: true },
  ...rosterSteps,
  { label: 'Configura competizione', href: `/apps/organizer/competition.html?event=${id}`, done: competitionConfigured },
  { label: 'Componi gironi', href: `/apps/organizer/gironi.html?event=${id}`, done: gironiComposed },
  { label: 'Genera calendario', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus !== 'NONE' },
  { label: 'Approva calendario', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus === 'APPROVED' || schedStatus === 'PUBLISHED' },
  { label: 'Pubblica evento', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus === 'PUBLISHED' },
  { label: 'Comunica avvisi', href: `/apps/organizer/avvisi.html?event=${id}`, done: false },
]

document.getElementById('steps')!.innerHTML = steps.map(s => {
  const inner = s.href && !s.disabled ? `<a href="${s.href}">${s.label}</a>` : `<span>${s.label}</span>`
  return `<li data-done="${s.done}" data-disabled="${s.disabled ? 'true' : 'false'}">${inner}</li>`
}).join('')
