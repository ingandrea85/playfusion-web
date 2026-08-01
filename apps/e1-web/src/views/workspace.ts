import type { EventDetail } from '@playfusion/rest-client'
import { renderOrganizerWorkspace, type WorkspaceTab } from '@playfusion/app-shell'

const TABS = (id: string): WorkspaceTab[] => [
  { key: 'overview', label: 'Panoramica', href: `#/events/${id}` },
  { key: 'enroll', label: 'Iscrizioni', href: `#/events/${id}/enroll` },
]

export function renderWorkspace(event: EventDetail, activeTab: string): string {
  const hero = renderOrganizerWorkspace(
    { name: `${event.sport} · ${event.categorie.join(', ')}`, meta: `${event.sport} · ${event.dates.from}→${event.dates.to}` },
    TABS(event.sportEventId), activeTab,
  )
  return `${hero}
    <main class="pf-container">
      <div class="pf-card pf-muted">Questa sezione arriva in S4+ (schermate feature).</div>
    </main>`
}
