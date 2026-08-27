import { renderOrganizerTopbar, esc, renderBracket, type BracketMatch } from '@playfusion/app-shell'
import { validateFormat, compileFormat, type CustomFinalsFormat, type FormatRound, type MatchRef } from '@playfusion/finals-format'
import { inlineError, errorCard, type Screen, type ViewCtx } from '../view.js'

const adminGate = (ctx: ViewCtx): string | null =>
  ctx.isPlatformAdmin ? null : errorCard('Sezione riservata agli amministratori della piattaforma.')

// ---------- List ----------
export function renderFormatsList(formats: CustomFinalsFormat[]): string {
  const rows = formats.length
    ? formats.map((f) => `<div class="pf-card pf-row" style="justify-content:space-between">
        <div><b>${esc(f.name)}</b> <span class="pf-mono pf-muted">· ${f.seeds} seed · ${f.rounds.length} turni</span></div>
        <span class="pf-row" style="gap:var(--space-sm)">
          <a class="pf-btn pf-btn--ghost" href="#/admin/finals-formats/${encodeURIComponent(f.id)}">Modifica</a>
          <button class="pf-btn pf-btn--ghost" data-del="${esc(f.id)}">Elimina</button>
        </span></div>`).join('')
    : `<div class="pf-card pf-muted">Nessun formato personalizzato. Creane uno.</div>`
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container">
      <div class="pf-row" style="margin-bottom:var(--space-lg)">
        <div class="pf-pagehead" style="margin-bottom:0"><div class="pf-eyebrow">Admin</div><h1>Formati fase finale</h1></div>
        <a class="pf-btn pf-btn--primary" href="#/admin/finals-formats/new">＋ Nuovo formato</a>
      </div>
      <div id="err"></div>
      <div class="pf-stack">${rows}</div>
    </main>`
}

export const finalsFormatsScreen: Screen<CustomFinalsFormat[]> = {
  load: (ctx) => ctx.client.o7.listFinalsFormats(),
  render: (formats) => renderFormatsList(formats),
  mount(root, ctx: ViewCtx) {
    if (!ctx.isPlatformAdmin) { root.innerHTML = errorCard('Sezione riservata agli amministratori.'); return }
    root.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Eliminare il formato?')) return
      try { await ctx.client.o7.deleteFinalsFormat(b.dataset.del!); ctx.refresh() }
      catch { root.querySelector('#err')!.innerHTML = inlineError('Eliminazione non riuscita.') }
    }))
  },
}

// ---------- Editor ----------
export interface FormatEditorData { format: CustomFinalsFormat | null }

const blankModel = (): CustomFinalsFormat => ({ id: '', name: '', seeds: 4, createdAt: '', rounds: [] })
const refToValue = (r: MatchRef): string => ('seed' in r ? `seed:${r.seed}` : 'winnerOf' in r ? `win:${r.winnerOf}` : `lose:${r.loserOf}`)
const valueToRef = (v: string): MatchRef => {
  const [k, rest] = [v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)]
  return k === 'seed' ? { seed: Number(rest) } : k === 'win' ? { winnerOf: rest } : { loserOf: rest }
}
/** Compile the model to the bracket-preview matches (placeholders shown as labels). */
export function previewMatches(m: CustomFinalsFormat): BracketMatch[] {
  return compileFormat(m).map((d) => ({ categoryId: 'preview', bracketLabel: d.bracketLabel, round: d.round, order: d.order, slot: d.slot, home: d.home, away: d.away, placementFrom: d.placementFrom, placementTo: d.placementTo, phase: 'FINAL' as const }))
}

export function renderFormatEditor(data: FormatEditorData): string {
  const m = data.format ?? blankModel()
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container">
      <div class="pf-pagehead"><div class="pf-eyebrow">Admin</div><h1>${data.format ? 'Modifica formato' : 'Nuovo formato'}</h1></div>
      <div id="err"></div>
      <div class="pf-ff-grid">
        <div>
          <div class="pf-card">
            <div class="pf-field"><label>Nome</label><input id="ff-name" value="${esc(m.name)}" placeholder="Es. Semifinali + finale + 3º/4º" /></div>
            <div class="pf-field" style="width:160px"><label>Numero seed (N)</label><input id="ff-seeds" type="number" min="2" value="${m.seeds}" /></div>
          </div>
          <div id="ff-form"></div>
          <button class="pf-btn" id="ff-add-round" style="margin-top:var(--space-sm)">＋ Aggiungi turno</button>
          <div id="ff-errors" style="margin-top:var(--space-md)"></div>
          <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm);margin-top:var(--space-md)">
            <button class="pf-btn pf-btn--primary" id="ff-save">Salva</button>
            <a class="pf-btn" href="#/admin/finals-formats">Annulla</a>
          </div>
        </div>
        <div class="pf-card"><div class="pf-eyebrow">Anteprima</div><div id="ff-preview" style="margin-top:var(--space-sm)"></div></div>
      </div>
    </main>`
}

export const finalsFormatEditorScreen: Screen<FormatEditorData> = {
  load: async (ctx, p) => ({ format: p.id && p.id !== 'new' ? await ctx.client.o7.getFinalsFormat(p.id) : null }),
  render: (data) => renderFormatEditor(data),
  mount(root, ctx: ViewCtx, data) {
    const gate = adminGate(ctx); if (gate) { root.innerHTML = gate; return }
    const model: CustomFinalsFormat = data.format ? structuredClone(data.format) : blankModel()
    const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!
    const form = q('#ff-form'), preview = q('#ff-preview'), errs = q('#ff-errors')

    const earlierSlots = (roundIdx: number): string[] => model.rounds.slice(0, roundIdx).flatMap((r) => r.matches.map((mm) => mm.slot)).filter(Boolean)
    const refSelect = (cls: string, ri: number, mi: number, side: 'home' | 'away', cur: MatchRef): string => {
      const seedOpts = Array.from({ length: model.seeds }, (_, i) => `<option value="seed:${i + 1}">Seed ${i + 1}</option>`).join('')
      const linkOpts = earlierSlots(ri).flatMap((s) => [`<option value="win:${esc(s)}">Vincente ${esc(s)}</option>`, `<option value="lose:${esc(s)}">Perdente ${esc(s)}</option>`]).join('')
      const html = `<select class="${cls}" data-r="${ri}" data-m="${mi}" data-side="${side}">${seedOpts}${linkOpts}</select>`
      const el = document.createElement('div'); el.innerHTML = html
      const sel = el.querySelector('select')!; sel.value = refToValue(cur)
      return el.innerHTML
    }
    const refreshPreview = () => {
      preview.innerHTML = renderBracket(previewMatches(model), () => 'Anteprima')
      const e = validateFormat(model)
      errs.innerHTML = e.length ? `<div class="pf-card" style="border-color:var(--color-feedback-danger)"><b>Da correggere:</b><ul>${e.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''
      q<HTMLButtonElement>('#ff-save').disabled = e.length > 0
    }
    const drawForm = () => {
      form.innerHTML = model.rounds.map((r, ri) => `<div class="pf-card" data-round="${ri}">
        <div class="pf-row" style="justify-content:space-between">
          <input class="ff-rname pf-input" data-r="${ri}" value="${esc(r.name)}" placeholder="Nome turno (es. Semifinali)" style="font-weight:700;flex:1" />
          <button class="pf-btn pf-btn--ghost" data-delround="${ri}">Rimuovi turno</button>
        </div>
        ${r.matches.map((mm, mi) => `<div class="pf-row" style="gap:var(--space-sm);align-items:center;margin-top:var(--space-sm);flex-wrap:wrap">
          <input class="ff-slot" data-r="${ri}" data-m="${mi}" value="${esc(mm.slot)}" placeholder="slot" style="width:80px" />
          ${refSelect('ff-ref', ri, mi, 'home', mm.home)} <span class="pf-muted">vs</span> ${refSelect('ff-ref', ri, mi, 'away', mm.away)}
          <input class="ff-pfrom" data-r="${ri}" data-m="${mi}" type="number" min="1" value="${mm.placementFrom ?? ''}" placeholder="pos." style="width:70px" title="Piazzamento (posizione del vincente)" />
          <button class="pf-btn pf-btn--ghost" data-delmatch="${ri}" data-mi="${mi}">✕</button>
        </div>`).join('')}
        <button class="pf-btn pf-btn--ghost" data-addmatch="${ri}" style="margin-top:var(--space-sm)">＋ Partita</button>
      </div>`).join('')
      bindForm()
    }
    const bindForm = () => {
      form.querySelectorAll<HTMLInputElement>('.ff-rname').forEach((el) => el.addEventListener('input', () => { model.rounds[Number(el.dataset.r)]!.name = el.value; refreshPreview() }))
      form.querySelectorAll<HTMLInputElement>('.ff-slot').forEach((el) => el.addEventListener('input', () => { model.rounds[Number(el.dataset.r)]!.matches[Number(el.dataset.m)]!.slot = el.value; refreshPreview() }))
      form.querySelectorAll<HTMLSelectElement>('.ff-ref').forEach((el) => el.addEventListener('change', () => {
        const mm = model.rounds[Number(el.dataset.r)]!.matches[Number(el.dataset.m)]!
        if (el.dataset.side === 'home') mm.home = valueToRef(el.value); else mm.away = valueToRef(el.value)
        refreshPreview()
      }))
      form.querySelectorAll<HTMLInputElement>('.ff-pfrom').forEach((el) => el.addEventListener('input', () => {
        const mm = model.rounds[Number(el.dataset.r)]!.matches[Number(el.dataset.m)]!
        const v = Number(el.value)
        if (Number.isInteger(v) && v >= 1) { mm.placementFrom = v; mm.placementTo = v + 1 } else { delete mm.placementFrom; delete mm.placementTo }
        refreshPreview()
      }))
      form.querySelectorAll<HTMLButtonElement>('[data-delround]').forEach((b) => b.addEventListener('click', () => { model.rounds.splice(Number(b.dataset.delround), 1); drawForm(); refreshPreview() }))
      form.querySelectorAll<HTMLButtonElement>('[data-addmatch]').forEach((b) => b.addEventListener('click', () => { model.rounds[Number(b.dataset.addmatch)]!.matches.push({ slot: '', home: { seed: 1 }, away: { seed: 2 } }); drawForm(); refreshPreview() }))
      form.querySelectorAll<HTMLButtonElement>('[data-delmatch]').forEach((b) => b.addEventListener('click', () => { model.rounds[Number(b.dataset.delmatch)]!.matches.splice(Number(b.dataset.mi), 1); drawForm(); refreshPreview() }))
    }

    q<HTMLInputElement>('#ff-name').addEventListener('input', (e) => { model.name = (e.target as HTMLInputElement).value; refreshPreview() })
    q<HTMLInputElement>('#ff-seeds').addEventListener('input', (e) => { const v = Number((e.target as HTMLInputElement).value); model.seeds = Number.isInteger(v) && v >= 2 ? v : model.seeds; drawForm(); refreshPreview() })
    q<HTMLButtonElement>('#ff-add-round').addEventListener('click', () => { model.rounds.push({ name: '', matches: [] } as FormatRound); drawForm(); refreshPreview() })
    q<HTMLButtonElement>('#ff-save').addEventListener('click', async () => {
      const input = { name: model.name.trim(), seeds: model.seeds, rounds: model.rounds }
      try {
        if (data.format) await ctx.client.o7.updateFinalsFormat(data.format.id, input)
        else await ctx.client.o7.saveFinalsFormat(input)
        ctx.navigate('#/admin/finals-formats')
      } catch { q('#err').innerHTML = inlineError('Salvataggio non riuscito (controlla il formato).') }
    })

    drawForm(); refreshPreview()
  },
}
