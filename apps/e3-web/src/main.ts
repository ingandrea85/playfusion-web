import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { renderLanding, renderParticipants } from './views/landing.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!
const client = createClient({ baseUrl: cfg.apiBaseUrl })

new HashRouter()
  .on('#/events/:id/participants', async ({ id }) => { app.innerHTML = renderParticipants(await client.o5.listRegistrations(id, 'Confirmed')) })
  .on('#/events/:id', async ({ id }) => { const [ev, win] = await Promise.all([client.o3.getEvent(id), client.o5.getRegistrationWindow(id)]); app.innerHTML = renderLanding(ev, win) })
  .on('#/', () => { app.innerHTML = '<main class="pf-container"><div class="pf-card pf-muted">Apri il link del tuo evento.</div></main>' })
  .start()
