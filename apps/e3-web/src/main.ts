import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter, applyBrand } from '@playfusion/app-shell'
import { createClient, resolveEventSite, eventLabels } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { renderLanding, renderParticipants, wireParticipants } from './views/landing.js'
import { renderPublicCalendar, wirePublicCalendar } from './views/calendar.js'
import { renderPublicStandings, wirePublicStandings } from './views/standings.js'
import { renderPublicBracket, wirePublicBracket } from './views/bracket.js'
import { renderDirector, wireDirector, directorScopeFromToken } from './views/director.js'
import { renderApply, buildApplyInput } from './views/apply.js'
import { renderPublicAvvisi, wirePublicAvvisi } from './views/avvisi.js'
import { captureMagicLink, magicLinkAuthProvider, storedToken, clearToken } from './auth/magic-link.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!

/** Renders a small error card into #app so a rejected call never leaves a blank page. */
function errorCard(msg: string): string {
  return `<main class="pf-container"><div class="pf-card">${msg}</div></main>`
}

/** S18: apply the event's tenant brand (colours + public wordmark) before rendering. Best-effort. */
async function applyEventBrand(ev: { organizationId?: string }): Promise<void> {
  if (!ev.organizationId) return
  try { applyBrand(await client.o1.getBrand(ev.organizationId)) } catch { /* leave the current theme */ }
}

// Capture ?token but KEEP it in the URL: these links (coach enrollment, field director) are the
// shareable credential and are reopened across devices/sessions. Stripping it made a URL copied
// from the address bar (post-open) token-less, so a second device saw "open your link". Storing
// in sessionStorage is only a same-tab convenience; the URL is the source of truth.
const token = captureMagicLink(new URL(window.location.href), sessionStorage)
void token
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
    await applyEventBrand(ev)
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
    try { const [ev, rows] = await Promise.all([client.o3.getEvent(id), client.o5.listRegistrations(id, 'Confirmed')]); await applyEventBrand(ev); const lb = eventLabels(ev); app.innerHTML = renderParticipants(rows, lb.participantPlural, lb.participant); wireParticipants(app, rows, lb.participant) }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/events/:id/apply', ({ id }) => applyRoute(id))
  .on('#/events/:id/director', async ({ id }) => {
    try {
      const scope = directorScopeFromToken(storedToken(sessionStorage))
      if (!scope) { app.innerHTML = errorCard('Apri il link direttore ricevuto dall\'organizzatore.'); return }
      if (scope.eventId !== id) { app.innerHTML = errorCard('Questo link direttore non vale per questo evento.'); return }
      const [ev, matches] = await Promise.all([client.o3.getEvent(id), client.o7.getMatches(id)])
      await applyEventBrand(ev)
      app.innerHTML = renderDirector(ev, scope.field, matches); wireDirector(app, client.o7, id, scope.field, matches)
    } catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/events/:id/standings', async ({ id }) => {
    try {
      const [ev, standings] = await Promise.all([client.o3.getEvent(id), client.o7.getStandings(id)]); await applyEventBrand(ev)
      // Epic #143 (S4): solo tabellone has no standings — send the visitor to the bracket instead.
      if (ev.format === 'bracket') { location.hash = `#/events/${encodeURIComponent(id)}/bracket`; return }
      app.innerHTML = renderPublicStandings(ev, standings); wirePublicStandings(app, standings, eventLabels(ev).participant)
    }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/events/:id/calendar', async ({ id }) => {
    try { const [ev, sched, matches] = await Promise.all([client.o3.getEvent(id), client.o7.getSchedule(id), client.o7.getMatches(id)]); await applyEventBrand(ev); app.innerHTML = renderPublicCalendar(ev, sched, matches); wirePublicCalendar(app, matches) }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  // Deep-link from a landing category chip: the calendar preselected to that category.
  .on('#/events/:id/calendar/:cat', async ({ id, cat }) => {
    try { const [ev, sched, matches] = await Promise.all([client.o3.getEvent(id), client.o7.getSchedule(id), client.o7.getMatches(id)]); await applyEventBrand(ev); app.innerHTML = renderPublicCalendar(ev, sched, matches, cat); wirePublicCalendar(app, matches, cat) }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/events/:id/avvisi', async ({ id }) => {
    try { const [ev, anns] = await Promise.all([client.o3.getEvent(id), client.o9.listAnnouncements(id)]); await applyEventBrand(ev); app.innerHTML = renderPublicAvvisi(ev, anns); wirePublicAvvisi(app, ev, anns) }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/events/:id/bracket', async ({ id }) => {
    try { const [ev, sched, matches, ranking] = await Promise.all([client.o3.getEvent(id), client.o7.getSchedule(id), client.o7.getMatches(id), client.o7.getFinalStandings(id)]); await applyEventBrand(ev); app.innerHTML = renderPublicBracket(ev, sched, matches, ranking); wirePublicBracket(app, matches, ranking) }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/events/:id', async ({ id }) => {
    try {
      const [ev, win, sched] = await Promise.all([client.o3.getEvent(id), client.o5.getRegistrationWindow(id), client.o7.getSchedule(id)])
      await applyEventBrand(ev)
      // Event Site (Pro): resolve the org defaults + per-event overrides into the public home.
      const orgSite = ev.organizationId ? await client.o1.getSite(ev.organizationId).catch(() => null) : null
      app.innerHTML = renderLanding(ev, win, sched.status === 'PUBLISHED', resolveEventSite(orgSite, ev.site))
    } catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/', () => { app.innerHTML = '<main class="pf-container"><div class="pf-card pf-muted">Apri il link del tuo evento.</div></main>' })
  .start()
