import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { renderLanding, renderParticipants } from './views/landing.js'
import { renderPublicCalendar, wirePublicCalendar } from './views/calendar.js'
import { renderPublicStandings, wirePublicStandings } from './views/standings.js'
import { renderApply, buildApplyInput } from './views/apply.js'
import { captureMagicLink, magicLinkAuthProvider, storedToken, clearToken } from './auth/magic-link.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!

/** Renders a small error card into #app so a rejected call never leaves a blank page. */
function errorCard(msg: string): string {
  return `<main class="pf-container"><div class="pf-card">${msg}</div></main>`
}

const token = captureMagicLink(new URL(window.location.href), sessionStorage)
if (token) window.history.replaceState({}, '', '/e3/' + window.location.hash) // strip ?token from the bar
const client = createClient({ baseUrl: cfg.apiBaseUrl, auth: magicLinkAuthProvider(sessionStorage) })

// Optional: confirm the link once and surface an invalid-link notice.
if (storedToken(sessionStorage)) {
  client.o2.verify(storedToken(sessionStorage)!).catch(() => {
    clearToken(sessionStorage) // a known-bad token must not be re-sent later
    app.insertAdjacentHTML('afterbegin', '<div class="pf-card" style="border-color:var(--color-feedback-danger)">Link non valido o scaduto.</div>')
  })
}

/** Apply route: render the coach form, then wire submit → o5.applyRegistration. The form
 *  only appears when a magic-link token is stored; on success the applied team lands in the
 *  E1 organizer inbox awaiting confirmation. */
async function applyRoute(id: string) {
  try {
    const [ev, win] = await Promise.all([client.o3.getEvent(id), client.o5.getRegistrationWindow(id)])
    app.innerHTML = renderApply(ev, win, !!storedToken(sessionStorage))
    const form = app.querySelector<HTMLFormElement>('#apply')
    if (!form) return
    const msg = app.querySelector('#msg')!
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const data = new FormData(form)
      const input = buildApplyInput(id, { participantRef: String(data.get('participantRef') ?? ''), categoria: String(data.get('categoria') ?? '') })
      if (!input.participantRef || !input.categoria) { msg.innerHTML = '<div class="pf-card" style="border-color:var(--color-feedback-danger)">Inserisci nome squadra e categoria.</div>'; return }
      const btn = form.querySelector<HTMLButtonElement>('[data-apply]')!; btn.disabled = true
      try {
        await client.o5.applyRegistration(input)
        app.innerHTML = `<main class="pf-container pf-container--narrow"><div class="pf-card">Iscrizione inviata! Sarà confermata dall'organizzatore. <a href="#/events/${encodeURIComponent(id)}">Torna all'evento</a></div></main>`
      } catch { msg.innerHTML = '<div class="pf-card" style="border-color:var(--color-feedback-danger)">Iscrizione non riuscita. Riprova.</div>'; btn.disabled = false }
    })
  } catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
}

new HashRouter()
  .on('#/events/:id/participants', async ({ id }) => {
    try { app.innerHTML = renderParticipants(await client.o5.listRegistrations(id, 'Confirmed')) }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/events/:id/apply', ({ id }) => applyRoute(id))
  .on('#/events/:id/standings', async ({ id }) => {
    try { const [ev, standings] = await Promise.all([client.o3.getEvent(id), client.o7.getStandings(id)]); app.innerHTML = renderPublicStandings(ev, standings); wirePublicStandings(app, standings) }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/events/:id/calendar', async ({ id }) => {
    try { const [ev, sched, matches] = await Promise.all([client.o3.getEvent(id), client.o7.getSchedule(id), client.o7.getMatches(id)]); app.innerHTML = renderPublicCalendar(ev, sched, matches); wirePublicCalendar(app, matches) }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/events/:id', async ({ id }) => {
    try {
      const [ev, win, sched] = await Promise.all([client.o3.getEvent(id), client.o5.getRegistrationWindow(id), client.o7.getSchedule(id)])
      app.innerHTML = renderLanding(ev, win, sched.status === 'PUBLISHED')
    } catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/', () => { app.innerHTML = '<main class="pf-container"><div class="pf-card pf-muted">Apri il link del tuo evento.</div></main>' })
  .start()
