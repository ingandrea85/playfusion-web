import type { EventDetail } from '@playfusion/rest-client'
import { renderOrganizerWorkspace, esc, type WorkspaceTab } from '@playfusion/app-shell'

const tabs = (id: string): WorkspaceTab[] => [
  { key: 'overview', label: 'Panoramica', href: `#/events/${encodeURIComponent(id)}` },
  { key: 'enroll', label: 'Iscrizioni', href: `#/events/${encodeURIComponent(id)}/enroll` },
]

export function renderWorkspace(event: EventDetail, activeTab: string): string {
  const hero = renderOrganizerWorkspace(
    { name: `${esc(event.sport)} · ${esc(event.categorie.join(', '))}`, meta: `${esc(event.sport)} · ${esc(event.dates.from)}→${esc(event.dates.to)}` },
    tabs(event.sportEventId), activeTab,
  )
  return `${hero}
    <main class="pf-container">
      <div class="pf-card pf-muted">Questa sezione arriva in S4+ (schermate feature).</div>
    </main>`
}
