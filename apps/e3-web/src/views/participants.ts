import type { RegistrationView } from '@playfusion/rest-client'
import { renderPublicTopbar, esc } from '@playfusion/app-shell'

export function renderParticipants(rows: RegistrationView[]): string {
  const items = rows.length
    ? rows.map((r) => `<li class="pf-card"><b>${esc(r.participantRef)}</b> · <span class="pf-mono">${esc(r.categoria)}</span></li>`).join('')
    : `<li class="pf-card pf-muted">Nessuna squadra confermata.</li>`
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><h1>Squadre iscritte</h1></div>
      <ul class="pf-stack" style="list-style:none;padding:0">${items}</ul>
    </main>`
}
