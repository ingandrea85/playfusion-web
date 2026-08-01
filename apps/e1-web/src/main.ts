import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { renderDashboard } from './views/dashboard.js'
import { renderWorkspace } from './views/workspace.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!
const client = createClient({ baseUrl: cfg.apiBaseUrl, orgId: cfg.orgId })

new HashRouter()
  .on('#/', async () => { app.innerHTML = renderDashboard(await client.o3.listEvents()) })
  .on('#/events/:id', async ({ id }) => { app.innerHTML = renderWorkspace(await client.o3.getEvent(id), 'overview') })
  .start()
