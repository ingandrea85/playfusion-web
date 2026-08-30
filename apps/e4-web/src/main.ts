import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter, esc } from '@playfusion/app-shell'
import { createClient, type Client, type Subscription } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { createAuth0Adapter, ensureAuthenticated, authProviderFrom, type Auth0Port } from './auth/auth0.js'
import { renderOrganizations, type OrgRow } from './views/organizations.js'
import { renderOrganization, wireOrganization } from './views/organization.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!

const errorCard = (msg: string) => `<main class="pf-container"><div class="pf-card">${esc(msg)}</div></main>`

/** Fixed admin topbar with the logged-in admin + logout. */
function topbar(port: Auth0Port, email?: string): void {
  const host = document.createElement('header')
  host.className = 'pf-topbar'
  host.innerHTML = `<a class="pf-brand" href="#/">play<b>fusion</b><small>Admin</small></a>
    <nav><span class="pf-muted" style="margin-right:12px">${esc(email ?? '')}</span><a href="#" id="logout">Esci</a></nav>`
  document.body.prepend(host)
  host.querySelector('#logout')!.addEventListener('click', (e) => { e.preventDefault(); void port.logout() })
}

async function boot() {
  try {
    if (!cfg.auth0) { app.innerHTML = errorCard('Config Auth0 mancante (VITE_AUTH0_*).'); return }
    const port = createAuth0Adapter(cfg.auth0)
    if (!(await ensureAuthenticated(port))) return // redirecting to Auth0
    const user = await port.getUser().catch(() => undefined)
    if (!user?.roles.includes('platform_admin')) {
      topbar(port, user?.email)
      app.innerHTML = `<main class="pf-container"><div class="pf-card">
        <h1 class="pf-h3">Accesso riservato</h1>
        <p class="pf-muted">Questa console è riservata agli amministratori di piattaforma (<code>platform_admin</code>).</p></div></main>`
      return
    }
    topbar(port, user.email)
    const client: Client = createClient({ baseUrl: cfg.apiBaseUrl, auth: authProviderFrom(port) })

    let current: () => Promise<void> = async () => {}
    const rerun = () => { void current() }

    new HashRouter()
      .on('#/', () => { current = () => listRoute(client); return current() })
      .on('#/organizations/:id', (p) => { current = () => detailRoute(client, p.id, rerun); return current() })
      .start()
  } catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
}

async function listRoute(client: Client): Promise<void> {
  try {
    const orgs = await client.o2.adminListOrgs()
    // Enrich each org with its plan (o11 is platform_admin-readable). Best-effort per row.
    const rows: OrgRow[] = await Promise.all(orgs.map(async (o) => ({
      ...o, sub: await client.o11.getSubscription(o.id).catch(() => null as Subscription | null),
    })))
    app.innerHTML = renderOrganizations(rows)
  } catch { app.innerHTML = errorCard('Impossibile caricare le organizzazioni.') }
}

async function detailRoute(client: Client, id: string, rerun: () => void): Promise<void> {
  try {
    const [detail, sub, events] = await Promise.all([
      client.o2.adminGetOrg(id),
      client.o11.getSubscription(id).catch(() => null as Subscription | null),
      client.o3.adminOrgEvents(id).catch(() => []),
    ])
    app.innerHTML = renderOrganization({ detail, sub, events })
    wireOrganization(app, id, {
      setPlan: (orgId, input) => client.o11.adminSetPlan(orgId, input),
      fail: (msg) => { app.querySelector('#err')!.innerHTML = `<div class="pf-card" role="alert" style="border-color:var(--color-feedback-danger);margin-bottom:var(--space-md)">${esc(msg)}</div>` },
      onDone: rerun,
    })
  } catch { app.innerHTML = errorCard('Impossibile caricare l\'organizzazione.') }
}

boot()
