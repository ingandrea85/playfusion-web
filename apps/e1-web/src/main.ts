import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { runScreen, errorCard, type ViewCtx, type Screen } from './view.js'
import { dashboardScreen } from './views/dashboard.js'
import { setOrgNavOwner } from './views/org.js'
import { orgSiteScreen } from './views/org-site.js'
import { eventSiteScreen } from './views/event-site.js'
import { createEventScreen } from './views/create-event.js'
import { workspaceScreen, categorieScreen } from './views/workspace.js'
import { gironiScreen } from './views/gironi.js'
import { scheduleScreen } from './views/schedule.js'
import { standingsScreen } from './views/standings.js'
import { finalsScreen } from './views/finals.js'
import { enrollScreen } from './views/enroll.js'
import { participantsScreen } from './views/participants.js'
import { resourcesScreen } from './views/resources.js'
import { announcementsScreen } from './views/announcements.js'
import { brandScreen } from './views/brand.js'
import { membersScreen } from './views/members.js'
import { subscriptionScreen } from './views/subscription.js'
import { finalsFormatsScreen, finalsFormatEditorScreen } from './views/finals-formats.js'
import { renderUserBadge, mountUserBadge } from './views/user-badge.js'
import { applyBrand } from '@playfusion/app-shell'
import { entitlements } from '@playfusion/entitlements'
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

    // S18: apply the tenant brand (colours + wordmark) once, before routing. Best-effort.
    applyBrand(await client.o1.getBrand(orgId).catch(() => null))

    // Account badge (role + change-password + logout): rendered once into a fixed container so it
    // persists across every route without threading user data through each screen.
    const user = await port.getUser().catch(() => undefined)
    if (user) {
      const host = document.createElement('div')
      host.innerHTML = renderUserBadge(user)
      document.body.appendChild(host)
      mountUserBadge(host, port)
    }
    const isPlatformAdmin = !!user?.roles.includes('platform_admin')
    // T4: org role from Auth0 claims — `tenant_admin` = OWNER (billing/brand/members), else ORGANIZER.
    const orgRole = user?.roles.includes('tenant_admin') ? 'OWNER' : 'ORGANIZER'
    setOrgNavOwner(orgRole === 'OWNER')

    // T1: the org's plan drives what's unlocked. Read the subscription once at boot (best-effort;
    // a not-yet-provisioned/errored subscription → most restrictive FREE entitlements).
    const sub = await client.o11.getSubscription(orgId).catch(() => null)
    const ent = entitlements(sub?.plan)

    let current: () => Promise<void> = async () => {}
    const ctx: ViewCtx = {
      client, orgId, e3BaseUrl: cfg.e3BaseUrl, isPlatformAdmin, orgRole, entitlements: ent,
      navigate: (hash) => { window.location.hash = hash },
      refresh: () => { void current() },
    }
    const route = <D>(screen: Screen<D>, params: Record<string, string>) => {
      current = () => runScreen(app, ctx, params, screen)
      return current()
    }
    new HashRouter()
      .on('#/', () => route(dashboardScreen, {}))
      .on('#/org', () => route(dashboardScreen, {}))
      .on('#/org/members', () => route(membersScreen, {}))
      .on('#/org/brand', () => route(brandScreen, {}))
      .on('#/org/site', () => route(orgSiteScreen, {}))
      .on('#/org/subscription', () => route(subscriptionScreen, {}))
      .on('#/admin/finals-formats/new', () => route(finalsFormatEditorScreen, {}))
      .on('#/admin/finals-formats/:id', (p) => route(finalsFormatEditorScreen, p))
      .on('#/admin/finals-formats', () => route(finalsFormatsScreen, {}))
      .on('#/events/new', () => route(createEventScreen, {}))
      .on('#/events/:id/categorie', (p) => route(categorieScreen, p))
      .on('#/events/:id/gironi', (p) => route(gironiScreen, p))
      .on('#/events/:id/schedule', (p) => route(scheduleScreen, p))
      .on('#/events/:id/standings', (p) => route(standingsScreen, p))
      .on('#/events/:id/finals', (p) => route(finalsScreen, p))
      .on('#/events/:id/resources', (p) => route(resourcesScreen, p))
      .on('#/events/:id/announcements', (p) => route(announcementsScreen, p))
      .on('#/events/:id/site', (p) => route(eventSiteScreen, p))
      .on('#/events/:id/enroll', (p) => route(enrollScreen, p))
      .on('#/events/:id/participants', (p) => route(participantsScreen, p))
      .on('#/events/:id', (p) => route(workspaceScreen, p))
      .start()
  } catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
}
boot()
