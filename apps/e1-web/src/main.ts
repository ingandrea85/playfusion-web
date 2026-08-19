import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { runScreen, errorCard, type ViewCtx, type Screen } from './view.js'
import { dashboardScreen } from './views/dashboard.js'
import { createEventScreen } from './views/create-event.js'
import { workspaceScreen, competitionScreen, categorieScreen } from './views/workspace.js'
import { gironiScreen } from './views/gironi.js'
import { scheduleScreen } from './views/schedule.js'
import { standingsScreen } from './views/standings.js'
import { finalsScreen } from './views/finals.js'
import { enrollScreen } from './views/enroll.js'
import { participantsScreen } from './views/participants.js'
import { resourcesScreen } from './views/resources.js'
import { createAuth0Adapter, ensureAuthenticated, authProviderFrom } from './auth/auth0.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!

async function boot() {
  try {
    if (!cfg.auth0) { app.innerHTML = errorCard('Config Auth0 mancante (VITE_AUTH0_*).'); return }
    const port = createAuth0Adapter(cfg.auth0)
    if (!(await ensureAuthenticated(port))) return // redirecting to Auth0
    const orgId = (await port.getOrgId()) ?? cfg.orgId
    const client = createClient({ baseUrl: cfg.apiBaseUrl, orgId, auth: authProviderFrom(port) })

    let current: () => Promise<void> = async () => {}
    const ctx: ViewCtx = {
      client, orgId, e3BaseUrl: cfg.e3BaseUrl,
      navigate: (hash) => { window.location.hash = hash },
      refresh: () => { void current() },
    }
    const route = <D>(screen: Screen<D>, params: Record<string, string>) => {
      current = () => runScreen(app, ctx, params, screen)
      return current()
    }
    new HashRouter()
      .on('#/', () => route(dashboardScreen, {}))
      .on('#/events/new', () => route(createEventScreen, {}))
      .on('#/events/:id/competition', (p) => route(competitionScreen, p))
      .on('#/events/:id/categorie', (p) => route(categorieScreen, p))
      .on('#/events/:id/gironi', (p) => route(gironiScreen, p))
      .on('#/events/:id/schedule', (p) => route(scheduleScreen, p))
      .on('#/events/:id/standings', (p) => route(standingsScreen, p))
      .on('#/events/:id/finals', (p) => route(finalsScreen, p))
      .on('#/events/:id/resources', (p) => route(resourcesScreen, p))
      .on('#/events/:id/enroll', (p) => route(enrollScreen, p))
      .on('#/events/:id/participants', (p) => route(participantsScreen, p))
      .on('#/events/:id', (p) => route(workspaceScreen, p))
      .start()
  } catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
}
boot()
