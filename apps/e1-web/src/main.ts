import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { renderDashboard } from './views/dashboard.js'
import { renderWorkspace } from './views/workspace.js'
import { createAuth0Adapter, ensureAuthenticated, authProviderFrom } from './auth/auth0.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!

/** Renders a small error card into #app so a rejected call never leaves a blank page. */
function errorCard(msg: string): string {
  return `<main class="pf-container"><div class="pf-card">${msg}</div></main>`
}

async function boot() {
  try {
    if (!cfg.auth0) { app.innerHTML = errorCard('Config Auth0 mancante (VITE_AUTH0_*).'); return }
    const port = createAuth0Adapter(cfg.auth0)
    if (!(await ensureAuthenticated(port))) return // redirecting to Auth0
    const orgId = (await port.getOrgId()) ?? cfg.orgId
    const client = createClient({ baseUrl: cfg.apiBaseUrl, orgId, auth: authProviderFrom(port) })
    new HashRouter()
      .on('#/', async () => {
        try { app.innerHTML = renderDashboard(await client.o3.listEvents()) }
        catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
      })
      .on('#/events/:id', async ({ id }) => {
        try { app.innerHTML = renderWorkspace(await client.o3.getEvent(id), 'overview') }
        catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
      })
      .start()
  } catch {
    app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.')
  }
}
boot()
