import { esc } from '@playfusion/app-shell'
import type { EventDetail, ResourceConfig, ResourcePlan, Resource, ResourceSlot } from '@playfusion/rest-client'
import { inlineError, type Screen } from '../view.js'
import { workspaceShell } from './workspace.js'

/** S17 — event resources & post-match logistics (docce, terzo tempo, …). Owner/Organizer surface
 *  (per-role gating arrives with S19). Config is a single per-event object; the turns are computed
 *  on read by o7 from match finish times + person-capacity. Every mutation saves the whole config. */
export interface ResourcesData { event: EventDetail; config: ResourceConfig; plan: ResourcePlan }

const resName = (r: { icon?: string; name: string }): string => `${r.icon ? `${esc(r.icon)} ` : ''}${esc(r.name)}`

function resourceTable(config: ResourceConfig): string {
  const rows = config.resources.length
    ? config.resources.map((r) => `<tr>
        <td>${resName(r)}</td><td>${r.occupancyMinutes}′</td><td>${r.capacityPersons} pers</td><td>+${r.offsetMinutes}′</td>
        <td><button class="pf-btn pf-btn--ghost" data-delres="${esc(r.resourceId)}">Rimuovi</button></td></tr>`).join('')
    : `<tr><td colspan="5" class="pf-muted">Nessuna risorsa. Aggiungine una (es. 🚿 Docce, 🍝 Terzo tempo).</td></tr>`
  return `<div class="pf-card"><h2 class="pf-h3">Risorse</h2>
    <table class="pf-table"><thead><tr><th>Risorsa</th><th>Occupazione</th><th>Capienza</th><th>Dopo fine partita</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="pf-row" style="margin-top:var(--space-sm);flex-wrap:wrap;gap:var(--space-xs)">
      <input id="r-icon" placeholder="🚿" style="width:3.5em" maxlength="2" />
      <input id="r-name" placeholder="Nome risorsa" style="flex:1;min-width:8em" />
      <input id="r-occ" type="number" min="1" placeholder="min" style="width:5em" />
      <input id="r-cap" type="number" min="1" placeholder="persone" style="width:6.5em" />
      <input id="r-off" type="number" min="0" placeholder="+min" style="width:5em" />
      <button class="pf-btn pf-btn--primary" data-addres>Aggiungi</button>
    </div>
    <p class="pf-muted">Occupazione = durata dello slot · Capienza = persone che condividono lo slot · Dopo fine partita = ritardo dall'ultima partita.</p></div>`
}

function sizeEditor(d: ResourcesData): string {
  const def = d.config.defaultTeamSize ?? d.plan.defaultTeamSize
  const rows = d.plan.teams.length
    ? d.plan.teams.map((t) => {
      const ov = d.config.teamSizes?.[t.team]
      return `<tr><td>${esc(t.team)}</td><td class="pf-mono">${esc(t.categoryId)}</td>
        <td><input type="number" min="1" data-teamsize="${esc(t.team)}" value="${ov ?? ''}" placeholder="${def}" style="width:5em" /></td></tr>`
    }).join('')
    : `<tr><td colspan="3" class="pf-muted">Nessuna squadra confermata.</td></tr>`
  return `<div class="pf-card"><h2 class="pf-h3">Dimensione squadre</h2>
    <div class="pf-row"><label>Default (persone)</label>
      <input id="r-default" type="number" min="1" value="${def}" style="width:5em" />
      <button class="pf-btn" data-setdefault>Salva default</button></div>
    <table class="pf-table" style="margin-top:var(--space-sm)"><thead><tr><th>Squadra</th><th>Categoria</th><th>Persone</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p class="pf-muted">Lascia vuoto per usare il default. La capienza è in persone, così le squadre piccole condividono lo slot.</p></div>`
}

const slotHtml = (s: ResourceSlot, r: Resource, day: string, moveOpts: (team: string) => string): string => {
  const pct = Math.min(100, Math.round((s.persons / Math.max(1, s.capacity)) * 100))
  return `<div class="pf-res-slot${s.overflow ? ' pf-res-slot--over' : ''}">
    <div class="pf-res-slot__head"><span class="pf-mono">${esc(s.time)}</span>
      <span class="pf-res-gauge"><span class="pf-res-gauge__bar" style="width:${pct}%"></span></span>
      <span class="pf-mono">${s.persons}/${s.capacity}${s.overflow ? ' ⚠' : ''}</span></div>
    <ul class="pf-res-slot__teams">${s.teams.map((t) => `<li>
      <span>${esc(t.team)} <span class="pf-muted pf-mono">${esc(t.categoryId)} · ${t.size}p${t.pinned ? ' · fissato' : ''}</span></span>
      <select class="pf-res-move" data-res="${esc(r.resourceId)}" data-day="${esc(day)}" data-team="${esc(t.team)}">${moveOpts(t.team)}</select>
    </li>`).join('')}</ul>
  </div>`
}

function renderTurns(d: ResourcesData, resourceId: string, day: string): string {
  const r = d.config.resources.find((x) => x.resourceId === resourceId)
  if (!r) return `<p class="pf-muted">Seleziona una risorsa.</p>`
  const slots = d.plan.turns.find((t) => t.resourceId === resourceId && t.day === day)?.slots ?? []
  if (!slots.length) return `<p class="pf-muted">Nessun turno per questa risorsa in questa giornata.</p>`
  const times = slots.map((s) => s.time)
  const moveOpts = (team: string): string => {
    const cur = (d.config.assignments ?? []).find((a) => a.resourceId === resourceId && a.day === day && a.team === team)?.slotTime
    return `<option value="AUTO"${cur ? '' : ' selected'}>Auto</option>` +
      times.map((t) => `<option value="${esc(t)}"${cur === t ? ' selected' : ''}>${esc(t)}</option>`).join('')
  }
  return slots.map((s) => slotHtml(s, r, day, moveOpts)).join('')
}

function turnsSection(d: ResourcesData): string {
  if (!d.config.resources.length) return `<div class="pf-card"><h2 class="pf-h3">Turni proposti</h2><p class="pf-muted">Aggiungi almeno una risorsa.</p></div>`
  if (!d.plan.days.length) return `<div class="pf-card"><h2 class="pf-h3">Turni proposti</h2><p class="pf-muted">Genera prima il calendario: i turni si calcolano dagli orari di fine partita.</p></div>`
  const day0 = d.plan.days[0]!, res0 = d.config.resources[0]!.resourceId
  const dayOpts = d.plan.days.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')
  const resOpts = d.config.resources.map((r) => `<option value="${esc(r.resourceId)}">${resName(r)}</option>`).join('')
  return `<div class="pf-card"><h2 class="pf-h3">Turni proposti</h2>
    <div class="pf-row"><label>Giornata</label><select id="r-day">${dayOpts}</select>
      <label>Risorsa</label><select id="r-res">${resOpts}</select></div>
    <div id="res-turns" style="margin-top:var(--space-sm)">${renderTurns(d, res0, day0)}</div></div>`
}

export function renderResources(d: ResourcesData): string {
  return workspaceShell(d.event, 'resources', `<div id="err"></div>${resourceTable(d.config)}${sizeEditor(d)}${turnsSection(d)}`)
}

function num(root: ParentNode, sel: string): number | undefined { const v = root.querySelector<HTMLInputElement>(sel)?.value ?? ''; const n = Number(v); return v !== '' && n > 0 ? Math.floor(n) : undefined }

export const resourcesScreen: Screen<ResourcesData> = {
  load: async (ctx, p) => {
    const [event, config, plan] = await Promise.all([
      ctx.client.o3.getEvent(p.id), ctx.client.o7.getResources(p.id), ctx.client.o7.getResourcePlan(p.id),
    ])
    return { event, config, plan }
  },
  render: renderResources,
  mount(root, ctx, d) {
    const id = d.event.sportEventId
    const err = root.querySelector('#err')!
    const fail = (m: string) => { err.innerHTML = inlineError(m) }
    const save = async (config: ResourceConfig) => { try { await ctx.client.o7.saveResources(id, config); ctx.refresh() } catch { fail('Salvataggio non riuscito.') } }

    root.querySelector('[data-addres]')?.addEventListener('click', () => {
      const name = (root.querySelector<HTMLInputElement>('#r-name')?.value ?? '').trim()
      const occ = num(root, '#r-occ'), cap = num(root, '#r-cap')
      const off = Number(root.querySelector<HTMLInputElement>('#r-off')?.value ?? '0') || 0
      const icon = (root.querySelector<HTMLInputElement>('#r-icon')?.value ?? '').trim() || undefined
      if (!name || !occ || !cap) { fail('Indica nome, occupazione (min) e capienza (persone).'); return }
      const resource: Resource = { resourceId: crypto.randomUUID(), name, icon, occupancyMinutes: occ, capacityPersons: cap, offsetMinutes: Math.max(0, off) }
      void save({ ...d.config, resources: [...d.config.resources, resource] })
    })
    root.querySelectorAll<HTMLButtonElement>('[data-delres]').forEach((b) => b.addEventListener('click', () => {
      const rid = b.dataset.delres!
      void save({ ...d.config, resources: d.config.resources.filter((r) => r.resourceId !== rid), assignments: (d.config.assignments ?? []).filter((a) => a.resourceId !== rid) })
    }))
    root.querySelector('[data-setdefault]')?.addEventListener('click', () => {
      void save({ ...d.config, defaultTeamSize: num(root, '#r-default') })
    })
    root.querySelectorAll<HTMLInputElement>('[data-teamsize]').forEach((i) => i.addEventListener('change', () => {
      const team = i.dataset.teamsize!, v = Number(i.value)
      const teamSizes = { ...(d.config.teamSizes ?? {}) }
      if (i.value !== '' && v > 0) teamSizes[team] = Math.floor(v); else delete teamSizes[team]
      void save({ ...d.config, teamSizes })
    }))

    // Turns: day/resource selects re-render client-side from the loaded plan (no refetch).
    const daySel = root.querySelector<HTMLSelectElement>('#r-day')
    const resSel = root.querySelector<HTMLSelectElement>('#r-res')
    const turnsEl = root.querySelector<HTMLElement>('#res-turns')
    const drawTurns = () => {
      if (!daySel || !resSel || !turnsEl) return
      turnsEl.innerHTML = renderTurns(d, resSel.value, daySel.value)
      wireMoves()
    }
    const wireMoves = () => root.querySelectorAll<HTMLSelectElement>('.pf-res-move').forEach((sel) => sel.addEventListener('change', () => {
      const { res, day, team } = sel.dataset as { res: string; day: string; team: string }
      const rest = (d.config.assignments ?? []).filter((a) => !(a.resourceId === res && a.day === day && a.team === team))
      const assignments = sel.value === 'AUTO' ? rest : [...rest, { resourceId: res, day, team, slotTime: sel.value }]
      void save({ ...d.config, assignments })
    }))
    daySel?.addEventListener('change', drawTurns)
    resSel?.addEventListener('change', drawTurns)
    wireMoves()
  },
}
