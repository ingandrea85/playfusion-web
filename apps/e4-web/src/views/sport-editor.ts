import { esc } from '@playfusion/app-shell'
import type { SportProfile, SportProfileInput, SportParticipants, SportTieBreak } from '@playfusion/rest-client'

const TIE_BREAKS: { key: SportTieBreak; label: string }[] = [
  { key: 'HEAD_TO_HEAD', label: 'Scontro diretto' },
  { key: 'SCORE_DIFFERENCE', label: 'Differenza punteggio' },
  { key: 'SCORE_FOR', label: 'Punteggio fatto' },
  { key: 'WINS', label: 'Vittorie' },
]
const PARTS: { key: SportParticipants; label: string }[] = [
  { key: 'team', label: 'Squadra' }, { key: 'individual', label: 'Individuale' }, { key: 'both', label: 'Entrambi' },
]

const blank = (): SportProfile => ({ id: '', name: '', participants: 'team', scoreLabel: '', points: { win: 3, draw: 1, loss: 0 }, tieBreak: [], createdAt: '' })

export function renderSportEditor(sport: SportProfile | null): string {
  const s = sport ?? blank()
  const noDraws = s.points.draw === null
  const seg = (cur: SportParticipants) => PARTS.map((p) =>
    `<label class="pf-segopt${p.key === cur ? ' on' : ''}"><input type="radio" name="sp-part" value="${p.key}"${p.key === cur ? ' checked' : ''} hidden/>${esc(p.label)}</label>`).join('')
  const tbRows = TIE_BREAKS.map((t) => `<label class="pf-tbopt"><input type="checkbox" class="js-tb" value="${t.key}"${s.tieBreak.includes(t.key) ? ' checked' : ''}/> ${esc(t.label)}</label>`).join('')
  return `<main class="pf-container">
    <div class="pf-pagehead"><a class="pf-eyebrow" href="#/sports">← Sport</a><h1>${sport ? 'Modifica sport' : 'Nuovo sport'}</h1></div>
    <div id="err"></div>
    <div class="pf-card">
      <div class="pf-field"><label>Nome sport</label><input id="sp-name" value="${esc(s.name)}" placeholder="Es. Tennis" /></div>
      <div class="pf-field"><label>Tipo partecipante ammesso</label><div class="pf-seg" id="sp-part-seg">${seg(s.participants)}</div></div>
      <div class="pf-field"><label>Etichetta punteggio</label><input id="sp-label" value="${esc(s.scoreLabel)}" placeholder="Es. Set, Reti, Punti" /></div>
      <div class="pf-field"><label><input type="checkbox" id="sp-nodraw"${noDraws ? ' checked' : ''}/> Nessun pareggio</label></div>
      <div class="pf-row" style="gap:var(--space-md)">
        <div class="pf-field" style="width:120px"><label>Punti vittoria</label><input id="sp-win" type="number" value="${s.points.win}" /></div>
        <div class="pf-field" style="width:120px"><label>Punti pareggio</label><input id="sp-draw" type="number" value="${s.points.draw ?? 1}"${noDraws ? ' disabled' : ''} /></div>
        <div class="pf-field" style="width:120px"><label>Punti sconfitta</label><input id="sp-loss" type="number" value="${s.points.loss}" /></div>
      </div>
      <div class="pf-field"><label>Criteri di spareggio (dopo i punti)</label><div class="pf-stack" id="sp-tb">${tbRows}</div>
        <p class="pf-muted" style="font-size:13px;margin:6px 0 0">L'ordine è quello dell'elenco; i punti sono sempre il criterio primario.</p></div>
      <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm)"><button class="pf-btn pf-btn--primary" id="sp-save">Salva</button><a class="pf-btn" href="#/sports">Annulla</a></div>
    </div>
  </main>`
}

/** Read the sport-profile form into a SportProfileInput. */
export function collectSport(root: ParentNode): SportProfileInput {
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)
  const val = (s: string) => (q<HTMLInputElement>(s)?.value ?? '').trim()
  const num = (s: string) => Number(q<HTMLInputElement>(s)?.value ?? '0') || 0
  const noDraws = !!q<HTMLInputElement>('#sp-nodraw')?.checked
  const participants = (root.querySelector<HTMLInputElement>('input[name="sp-part"]:checked')?.value ?? 'team') as SportParticipants
  const tieBreak = [...root.querySelectorAll<HTMLInputElement>('.js-tb:checked')].map((el) => el.value as SportTieBreak)
  return {
    name: val('#sp-name'), participants, scoreLabel: val('#sp-label'),
    points: { win: num('#sp-win'), draw: noDraws ? null : num('#sp-draw'), loss: num('#sp-loss') },
    tieBreak,
  }
}
