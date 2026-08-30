import { esc } from '@playfusion/app-shell'
import type { SportProfile, SportParticipants } from '@playfusion/rest-client'

const PART_LABEL: Record<SportParticipants, string> = { team: 'Squadra', individual: 'Individuale', both: 'Entrambi' }
const pointsLine = (p: SportProfile['points']): string => `${p.win} / ${p.draw === null ? '–' : p.draw} / ${p.loss}`

export function renderSports(sports: SportProfile[]): string {
  const rows = sports.length
    ? sports.map((s) => `<tr>
        <td><b>${esc(s.name)}</b></td>
        <td><span class="pf-badge">${esc(PART_LABEL[s.participants])}</span></td>
        <td>${esc(s.scoreLabel)}</td>
        <td class="pf-mono">${pointsLine(s.points)}</td>
        <td class="pf-mono pf-muted">${s.tieBreak.length ? esc(s.tieBreak.join(' · ')) : '—'}</td>
        <td class="pf-row" style="gap:var(--space-sm);justify-content:flex-end">
          <a class="pf-btn pf-btn--ghost" href="#/sports/${encodeURIComponent(s.id)}">Modifica</a>
          <button class="pf-btn pf-btn--ghost" data-del="${esc(s.id)}">Elimina</button>
        </td></tr>`).join('')
    : `<tr><td colspan="6" class="pf-muted">Nessuno sport configurato.</td></tr>`
  return `<main class="pf-container">
    <div class="pf-row" style="margin-bottom:var(--space-lg)">
      <div class="pf-pagehead" style="margin-bottom:0"><div class="pf-eyebrow">Admin</div><h1>Sport</h1></div>
      <a class="pf-btn pf-btn--primary" href="#/sports/new">＋ Nuovo sport</a>
    </div>
    <div id="err"></div>
    <div class="pf-card" style="padding:0;overflow-x:auto">
      <table class="pf-table">
        <thead><tr><th>Sport</th><th>Partecipanti</th><th>Punteggio</th><th>Punti V/N/P</th><th>Spareggi</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </main>`
}
