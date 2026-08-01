import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { renderLanding, renderParticipants } from './views/landing.js'
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

new HashRouter()
  .on('#/events/:id/participants', async ({ id }) => {
    try { app.innerHTML = renderParticipants(await client.o5.listRegistrations(id, 'Confirmed')) }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/events/:id', async ({ id }) => {
    try { const [ev, win] = await Promise.all([client.o3.getEvent(id), client.o5.getRegistrationWindow(id)]); app.innerHTML = renderLanding(ev, win) }
    catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
  })
  .on('#/', () => { app.innerHTML = '<main class="pf-container"><div class="pf-card pf-muted">Apri il link del tuo evento.</div></main>' })
  .start()
