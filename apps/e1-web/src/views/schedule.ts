import { esc, renderCalendar } from '@playfusion/app-shell'
import type { EventDetail, ScheduleConfig, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'
import { workspaceShell } from './workspace.js'

export interface ScheduleData {
  event: EventDetail
  schedule: ScheduleView
  matches: ScheduledMatchView[]
}

const STATUS_LABEL: Record<ScheduleView['status'], string> = {
  NONE: 'Da generare', GENERATED: 'Generato', APPROVED: 'Approvato', PUBLISHED: 'Pubblicato',
}
const isLocked = (s: ScheduleView['status']): boolean => s === 'APPROVED' || s === 'PUBLISHED'

/** Category label for the calendar: categories are plain strings on the event, so the
 *  categoryId is the display name. */
const catName = (c: string): string => c

function fieldRows(fields: string[], locked: boolean): string {
  return fields.map((f, i) =>
    `<div class="pf-row" data-fieldrow style="justify-content:flex-start;gap:var(--space-sm);margin-bottom:var(--space-sm)">
      <input class="js-field" data-i="${i}" value="${esc(f)}" ${locked ? 'disabled' : ''} style="flex:1" />
      ${locked ? '' : `<button type="button" class="pf-btn js-rmfield" data-i="${i}" aria-label="Rimuovi campo">✕</button>`}
    </div>`).join('')
}

function numField(id: string, label: string, value: number, min: number, locked: boolean): string {
  return `<div class="pf-field" style="flex:1;margin-bottom:0"><label>${label}</label>
    <input id="${id}" type="number" min="${min}" value="${value}" ${locked ? 'disabled' : ''} /></div>`
}

function configCard(cfg: ScheduleConfig, status: ScheduleView['status']): string {
  const locked = isLocked(status)
  const dis = locked ? 'disabled' : ''
  return `<div class="pf-card">
    <h2 class="pf-h3">Configurazione</h2>
    <div class="pf-field"><label>Campi</label><div id="fields">${fieldRows(cfg.fields, locked)}</div>
      ${locked ? '' : '<button type="button" class="pf-btn" id="addfield">＋ Aggiungi campo</button>'}</div>
    <div class="pf-row" style="align-items:flex-end;justify-content:flex-start;gap:var(--space-md);margin-top:var(--space-md)">
      ${numField('periods', 'N. tempi', cfg.periods, 1, locked)}
      ${numField('periodMinutes', 'Durata tempo (min)', cfg.periodMinutes, 1, locked)}
      ${numField('breakMinutes', 'Pausa (min)', cfg.breakMinutes, 0, locked)}
    </div>
    <div class="pf-row" style="align-items:flex-end;justify-content:flex-start;gap:var(--space-md);margin-top:var(--space-md)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Inizio giornata</label><input id="dailyStart" type="time" value="${esc(cfg.dailyStart)}" ${dis} /></div>
      ${numField('slotsPerDay', 'Slot per giornata', cfg.slotsPerDay, 1, locked)}
    </div>
    <div class="pf-row" style="align-items:flex-end;justify-content:flex-start;gap:var(--space-md);margin-top:var(--space-md)">
      ${numField('groupsCount', 'Gironi per categoria', cfg.groupsCount, 1, locked)}
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Andata/ritorno</label>
        <select id="legs" ${dis}>
          <option value="SINGLE" ${cfg.legs === 'SINGLE' ? 'selected' : ''}>Solo andata</option>
          <option value="HOME_AWAY" ${cfg.legs === 'HOME_AWAY' ? 'selected' : ''}>Andata e ritorno</option>
        </select>
      </div>
    </div>
    ${locked
      ? '<p class="pf-muted" style="margin-top:var(--space-md)">Calendario approvato: la configurazione è bloccata.</p>'
      : '<button class="pf-btn pf-btn--primary" id="generate" style="margin-top:var(--space-md)">Genera calendario</button>'}
  </div>`
}

function actionsCard(status: ScheduleView['status']): string {
  if (status === 'NONE') return `<div class="pf-card pf-muted">Genera il calendario per poterlo approvare e pubblicare.</div>`
  return `<div class="pf-card"><div class="pf-row">
    <div><div class="pf-eyebrow">Stato calendario</div><h2 class="pf-h3" style="margin:4px 0 0">${STATUS_LABEL[status]}</h2></div>
    <div class="pf-row" style="gap:var(--space-sm)">
      <button class="pf-btn pf-btn--primary" id="approve" ${status === 'GENERATED' ? '' : 'disabled'}>Approva</button>
      <button class="pf-btn pf-btn--primary" id="publish" ${status === 'APPROVED' ? '' : 'disabled'}>Pubblica</button>
    </div>
  </div></div>`
}

export function renderSchedule(data: ScheduleData): string {
  const { event, schedule, matches } = data
  const calendar = schedule.status === 'NONE' ? '' : `<div class="pf-card"><h2 class="pf-h3">Calendario</h2>${renderCalendar(matches, catName)}</div>`
  return workspaceShell(event, 'schedule',
    `<div id="err"></div>${configCard(schedule.config, schedule.status)}${actionsCard(schedule.status)}${calendar}`)
}

/** Schedule is stateful (the editable field list), so mount keeps the list locally and
 *  redraws it in place; generate/approve/publish call the o7 seam then ctx.refresh(). */
export const scheduleScreen: Screen<ScheduleData> = {
  load: async (ctx, p) => {
    const [event, schedule, matches] = await Promise.all([
      ctx.client.o3.getEvent(p.id), ctx.client.o7.getSchedule(p.id), ctx.client.o7.getMatches(p.id),
    ])
    return { event, schedule, matches }
  },
  render: renderSchedule,
  mount(root, ctx: ViewCtx, data) {
    const id = data.event.sportEventId
    const err = root.querySelector('#err')!
    if (isLocked(data.schedule.status)) { wireStatus(); return }

    let fields = [...data.schedule.config.fields]
    const host = root.querySelector('#fields')!
    const redrawFields = () => {
      host.innerHTML = fieldRows(fields, false)
      host.querySelectorAll<HTMLInputElement>('.js-field').forEach((inp) =>
        inp.addEventListener('change', () => { fields[Number(inp.dataset.i)] = inp.value.trim() }))
      host.querySelectorAll<HTMLButtonElement>('.js-rmfield').forEach((btn) =>
        btn.addEventListener('click', () => { fields.splice(Number(btn.dataset.i), 1); redrawFields() }))
    }
    redrawFields()
    root.querySelector('#addfield')?.addEventListener('click', () => { fields.push(`Campo ${fields.length + 1}`); redrawFields() })

    const numOf = (sel: string, fallback: number): number => {
      const v = Number((root.querySelector<HTMLInputElement>(sel))?.value)
      return Number.isFinite(v) && v > 0 ? v : fallback
    }
    root.querySelector('#generate')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true
      const config: ScheduleConfig = {
        fields: fields.map((f) => f.trim()).filter(Boolean),
        periods: numOf('#periods', 2),
        periodMinutes: numOf('#periodMinutes', 20),
        breakMinutes: Number((root.querySelector<HTMLInputElement>('#breakMinutes'))?.value ?? 10) || 0,
        dailyStart: (root.querySelector<HTMLInputElement>('#dailyStart'))?.value || '09:00',
        slotsPerDay: numOf('#slotsPerDay', 8),
        groupsCount: numOf('#groupsCount', 1),
        legs: ((root.querySelector<HTMLSelectElement>('#legs'))?.value === 'HOME_AWAY' ? 'HOME_AWAY' : 'SINGLE'),
      }
      if (!config.fields.length) { err.innerHTML = inlineError('Aggiungi almeno un campo.'); btn.disabled = false; return }
      try { await ctx.client.o7.generateSchedule(id, config); ctx.refresh() }
      catch { err.innerHTML = inlineError('Generazione non riuscita. Riprova.'); btn.disabled = false }
    })
    wireStatus()

    function wireStatus() {
      const approve = root.querySelector<HTMLButtonElement>('#approve')
      const publish = root.querySelector<HTMLButtonElement>('#publish')
      if (approve && !approve.disabled) approve.addEventListener('click', async () => {
        approve.disabled = true
        try { await ctx.client.o7.approveSchedule(id); ctx.refresh() }
        catch { err.innerHTML = inlineError('Approvazione non riuscita.'); approve.disabled = false }
      })
      if (publish && !publish.disabled) publish.addEventListener('click', async () => {
        publish.disabled = true
        try { await ctx.client.o7.publishSchedule(id); ctx.refresh() }
        catch { err.innerHTML = inlineError('Pubblicazione non riuscita.'); publish.disabled = false }
      })
    }
  },
}
