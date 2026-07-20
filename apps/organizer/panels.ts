import { getScheduledMatches, getFinals, getSchedule, rescheduleMatch, recordResult, recordFinalResult, setTieOverride } from '../../shared/mock/store'

function panel(): HTMLElement { return document.getElementById('editmatch')! }

export function openEditPanel(eventId: string, matchId: string, onDone: () => void): void {
  const m = getScheduledMatches(eventId).find(x => x.id === matchId); if (!m) return
  const fields = getSchedule(eventId)?.config.byCategory[m.categoryId]?.fields ?? [...new Set(getScheduledMatches(eventId).map(x => x.field))]
  panel().innerHTML = `<div class="pf-card"><h2>Sposta partita</h2><p class="pf-muted">${m.home} vs ${m.away}</p>
    <div class="pf-field"><label>Campo</label><select id="em-field">${fields.map(f => `<option value="${f}"${f === m.field ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Giorno</label><input id="em-day" type="date" value="${m.day}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Ora</label><input id="em-time" type="time" value="${m.time}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="em-save">Salva</button><button class="pf-btn" id="em-cancel">Annulla</button></div></div>`
  document.getElementById('em-save')!.addEventListener('click', () => {
    rescheduleMatch(matchId, { day: (document.getElementById('em-day') as HTMLInputElement).value, time: (document.getElementById('em-time') as HTMLInputElement).value, field: (document.getElementById('em-field') as HTMLSelectElement).value })
    onDone()
  })
  document.getElementById('em-cancel')!.addEventListener('click', () => { panel().innerHTML = '' })
}

export function openResultPanel(eventId: string, matchId: string, onDone: () => void): void {
  const m = getScheduledMatches(eventId).find(x => x.id === matchId); if (!m) return
  panel().innerHTML = `<div class="pf-card"><h2>Risultato</h2><p class="pf-muted">${m.home} vs ${m.away}</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${m.home}</label><input id="rs-home" type="number" min="0" value="${m.homeScore ?? 0}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${m.away}</label><input id="rs-away" type="number" min="0" value="${m.awayScore ?? 0}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="rs-save">Salva</button><button class="pf-btn" id="rs-cancel">Annulla</button></div></div>`
  document.getElementById('rs-save')!.addEventListener('click', () => {
    recordResult(matchId, Number((document.getElementById('rs-home') as HTMLInputElement).value), Number((document.getElementById('rs-away') as HTMLInputElement).value)); onDone()
  })
  document.getElementById('rs-cancel')!.addEventListener('click', () => { panel().innerHTML = '' })
}

export function openFinalResultPanel(eventId: string, finalMatchId: string, onDone: () => void): void {
  const f = getFinals(eventId).find(x => x.id === finalMatchId); if (!f) return
  const home = f.homeResolved ?? f.home; const away = f.awayResolved ?? f.away
  panel().innerHTML = `<div class="pf-card"><h2>Risultato · ${f.round}</h2><p class="pf-muted">${home} vs ${away}</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${home}</label><input id="ff-home" type="number" min="0" value="${f.homeScore ?? 0}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${away}</label><input id="ff-away" type="number" min="0" value="${f.awayScore ?? 0}" /></div>
    </div>
    <p class="pf-muted" style="margin:var(--space-3) 0 4px">Rigori — solo in caso di parità</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${home} (d.c.r.)</label><input id="ff-sh-home" type="number" min="0" value="${f.homeShootout ?? ''}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${away} (d.c.r.)</label><input id="ff-sh-away" type="number" min="0" value="${f.awayShootout ?? ''}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="ff-save">Salva</button><button class="pf-btn" id="ff-cancel">Annulla</button></div></div>`
  document.getElementById('ff-save')!.addEventListener('click', () => {
    const hs = (document.getElementById('ff-sh-home') as HTMLInputElement).value; const as = (document.getElementById('ff-sh-away') as HTMLInputElement).value
    const shootout = hs !== '' && as !== '' ? { home: Number(hs), away: Number(as) } : undefined
    recordFinalResult(finalMatchId, Number((document.getElementById('ff-home') as HTMLInputElement).value), Number((document.getElementById('ff-away') as HTMLInputElement).value), shootout); onDone()
  })
  document.getElementById('ff-cancel')!.addEventListener('click', () => { panel().innerHTML = '' })
}

export function openTiePanel(eventId: string, categoryId: string, groupLabel: string, teams: string[], onDone: () => void): void {
  const order = [...teams]
  const draw = (): void => {
    panel().innerHTML = `<div class="pf-card"><h2>Risolvi parità</h2><p class="pf-muted">${groupLabel} · ordina le squadre a pari merito</p>
      <ol class="pf-tblist">${order.map((t, i) => `<li class="pf-tbrow"><span>${i + 1}. ${t}</span>
        <span class="pf-tbmove"><button type="button" class="pf-btn pf-btn--ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="pf-btn pf-btn--ghost" data-down="${i}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button></span></li>`).join('')}</ol>
      <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="tie-save">Salva</button><button class="pf-btn" id="tie-cancel">Annulla</button></div></div>`
    panel().querySelectorAll<HTMLButtonElement>('button[data-up]').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.up); [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw() }))
    panel().querySelectorAll<HTMLButtonElement>('button[data-down]').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.down); [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw() }))
    document.getElementById('tie-save')!.addEventListener('click', () => { setTieOverride(eventId, categoryId, groupLabel, order); onDone() })
    document.getElementById('tie-cancel')!.addEventListener('click', () => { panel().innerHTML = '' })
  }
  draw()
}
