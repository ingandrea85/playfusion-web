import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvent, getRegistrations } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const event = getEvent(id)
document.getElementById('title')!.textContent = event ? event.name : 'Evento non trovato'

const regs = event ? getRegistrations(id) : []
const anyPaid = regs.some(r => r.paymentStatus === 'PAID')

type Step = { label: string; href?: string; done: boolean; disabled?: boolean }
const steps: Step[] = [
  { label: 'Crea evento da template', done: !!event },
  { label: 'Configura categorie', href: `/apps/organizer/categories.html?event=${id}`, done: true },
  { label: 'Apri iscrizioni', href: `/apps/organizer/registrations.html?event=${id}`, done: !!event?.registrationsOpen },
  { label: 'Conferma squadre', href: `/apps/organizer/inbox.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') },
  { label: 'Riscuoti quote', href: `/apps/organizer/payments.html?event=${id}`, done: anyPaid },
  { label: 'Genera calendario', done: false, disabled: true },
  { label: 'Approva calendario', done: false, disabled: true },
  { label: 'Pubblica evento', done: false, disabled: true },
]

document.getElementById('steps')!.innerHTML = steps.map(s => {
  const inner = s.href && !s.disabled ? `<a href="${s.href}">${s.label}</a>` : `<span>${s.label}</span>`
  return `<li data-done="${s.done}" data-disabled="${s.disabled ? 'true' : 'false'}">${inner}</li>`
}).join('')
