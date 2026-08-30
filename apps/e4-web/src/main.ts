import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter, esc } from '@playfusion/app-shell'
import { createClient, type Client, type Subscription } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { createAuth0Adapter, ensureAuthenticated, authProviderFrom, type Auth0Port } from './auth/auth0.js'
import { renderOrganizations, type OrgRow } from './views/organizations.js'
import { renderOrganization, wireOrganization } from './views/organization.js'
import { renderSports } from './views/sports.js'
import { renderSportEditor, collectSport } from './views/sport-editor.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!

const errorCard = (msg: string) => `<main class="pf-container"><div class="pf-card">${esc(msg)}</div></main>`

/** Fixed admin topbar with the logged-in admin + logout. */
function topbar(port: Auth0Port, email?: string): void {
  const host = document.createElement('header')
  host.className = 'pf-topbar'
  host.innerHTML = `<a class="pf-brand" href="#/">play<b>fusion</b><small>Admin</small></a>
    <nav><a href="#/">Organizzazioni</a> <a href="#/sports">Sport</a>
      <span class="pf-muted" style="margin:0 12px">${esc(email ?? '')}</span><a href="#" id="logout">Esci</a></nav>`
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
      .on('#/sports/new', () => { current = () => sportEditorRoute(client, null, rerun); return current() })
      .on('#/sports/:id', (p) => { current = () => sportEditorRoute(client, p.id, rerun); return current() })
      .on('#/sports', () => { current = () => sportsRoute(client, rerun); return current() })
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

async function sportsRoute(client: Client, rerun: () => void): Promise<void> {
  try {
    const sports = await client.o3.listSports()
    app.innerHTML = renderSports(sports)
    app.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Eliminare lo sport?')) return
      try { await client.o3.adminDeleteSport(b.dataset.del!); rerun() }
      catch { app.querySelector('#err')!.innerHTML = `<div class="pf-card" role="alert" style="border-color:var(--color-feedback-danger);margin-bottom:var(--space-md)">Eliminazione non riuscita.</div>` }
    }))
  } catch { app.innerHTML = errorCard('Impossibile caricare gli sport.') }
}

async function sportEditorRoute(client: Client, id: string | null, rerun: () => void): Promise<void> {
  try {
    const sport = id && id !== 'new' ? await client.o3.getSport(id) : null
    app.innerHTML = renderSportEditor(sport)
    const fail = (m: string) => { app.querySelector('#err')!.innerHTML = `<div class="pf-card" role="alert" style="border-color:var(--color-feedback-danger);margin-bottom:var(--space-md)">${esc(m)}</div>` }
    const nodraw = app.querySelector<HTMLInputElement>('#sp-nodraw')!
    const drawInp = app.querySelector<HTMLInputElement>('#sp-draw')!
    nodraw.addEventListener('change', () => { drawInp.disabled = nodraw.checked })
    app.querySelectorAll<HTMLInputElement>('input[name="sp-part"]').forEach((r) => r.addEventListener('change', () => {
      app.querySelectorAll('.pf-segopt').forEach((o) => o.classList.toggle('on', (o.querySelector('input') as HTMLInputElement).checked))
    }))
    app.querySelector<HTMLButtonElement>('#sp-save')!.addEventListener('click', async () => {
      const input = collectSport(app)
      const btn = app.querySelector<HTMLButtonElement>('#sp-save')!; btn.disabled = true
      try {
        if (sport) await client.o3.adminUpdateSport(sport.id, input); else await client.o3.adminCreateSport(input)
        window.location.hash = '#/sports'; rerun()
      } catch { fail('Salvataggio non riuscito (controlla i campi).'); btn.disabled = false }
    })
  } catch { app.innerHTML = errorCard('Impossibile caricare lo sport.') }
}

boot()
