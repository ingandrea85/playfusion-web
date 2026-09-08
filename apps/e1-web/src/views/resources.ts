import { esc, copyToClipboard } from '@playfusion/app-shell'
import type { EventDetail, ResourceConfig, ResourcePlan, Resource, ResourceSlot, ResourceGroup, ResourceRelation, PlanNodeInfo, NodeMode } from '@playfusion/rest-client'
import { inlineError, lockCard, type Screen } from '../view.js'
import { workspaceShell } from './workspace.js'

/** S17 — event resources & post-match logistics (docce, terzo tempo, …). Owner/Organizer surface
 *  (per-role gating arrives with S19). Config is a single per-event object; the turns are computed
 *  on read by o7 from match finish times + person-capacity. Every mutation saves the whole config. */
export interface ResourcesData { event: EventDetail; config: ResourceConfig; plan: ResourcePlan; locked?: boolean }

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

/** S17 Wave A — named pools ("Docce" = spogliatoio 1 + 2) and ordering ("Docce → Mensa"). Both live
 *  on the same ResourceConfig; the plan graph (nodes/topo order) is computed server-side by o7. */
function groupsCard(d: ResourcesData): string {
  const groups = d.config.groups ?? []
  const byId = new Map(d.config.resources.map((r) => [r.resourceId, r]))
  const cards = groups.map((g) => {
    const pool = g.memberIds.map((id) => byId.get(id)).filter(Boolean) as typeof d.config.resources
    const cap = pool.reduce((n, r) => n + r.capacityPersons, 0)
    const members = pool.map((r) => `<span class="pf-pill pf-pill--member">${esc(r.name)} · ${r.capacityPersons}</span>`).join('')
    return `<div class="pf-group"><div class="pf-group__head"><span class="pf-group__name">${g.icon ? `${esc(g.icon)} ` : ''}${esc(g.name)}</span>
      <button class="pf-btn pf-btn--ghost" data-delgroup="${esc(g.groupId)}">Rimuovi gruppo</button>
      <span class="pf-group__cap">pool ${cap} posti</span></div>
      <div class="pf-group__members">${members}</div></div>`
  }).join('')
  const free = d.config.resources.filter((r) => !groups.some((g) => g.memberIds.includes(r.resourceId)))
  const opts = free.map((r) => `<option value="${esc(r.resourceId)}">${esc(r.name)}</option>`).join('')
  return `<div class="pf-card"><h2 class="pf-h3">Gruppi (pool di capienza)</h2>
    <p class="pf-muted">Risorse dello stesso tipo diventano un unico pool su cui le squadre vengono distribuite.</p>
    ${cards}
    <div class="pf-row" style="margin-top:10px">
      <input id="g-icon" placeholder="🚿" style="width:3.2em" maxlength="2" />
      <input id="g-name" placeholder="Nome gruppo" style="flex:1;min-width:9em" />
      <select id="g-member" multiple size="3" style="min-width:10em">${opts}</select>
      <button class="pf-btn pf-btn--primary" id="g-add">Crea gruppo</button>
    </div></div>`
}

/** Linear rendering in topo order with arrows between consecutive nodes; a full DAG layout (columns by
 *  rank) is overkill for the handful of nodes a real event has. */
function pipelineMap(nodes: PlanNodeInfo[]): string {
  const cells = nodes.map((n) => `<span class="pf-node${n.predecessorIds.length ? '' : ' pf-node--root'}">${n.icon ? `${esc(n.icon)} ` : ''}${esc(n.label)}</span>`)
  return `<div class="pf-pipe">${cells.join('<span class="pf-arrow">→</span>')}</div>`
}

/** Kahn's algorithm over the current plan nodes + a candidate edge set, mirroring o7's
 *  `validateResourceConfig` cycle check (not importable client-side from the service package). */
function hasRelationCycle(nodes: PlanNodeInfo[], relations: ResourceRelation[]): boolean {
  const ids = new Set(nodes.map((n) => n.nodeId))
  const edges = relations.filter((e) => ids.has(e.from) && ids.has(e.to))
  const indeg = new Map(nodes.map((n) => [n.nodeId, 0] as [string, number]))
  const adj = new Map(nodes.map((n) => [n.nodeId, [] as string[]]))
  for (const e of edges) { adj.get(e.from)!.push(e.to); indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1) }
  const queue = nodes.filter((n) => (indeg.get(n.nodeId) ?? 0) === 0).map((n) => n.nodeId)
  let visited = 0
  while (queue.length) {
    const id = queue.shift()!
    visited++
    for (const to of adj.get(id)!) { indeg.set(to, indeg.get(to)! - 1); if (indeg.get(to) === 0) queue.push(to) }
  }
  return visited !== nodes.length
}

function relationsCard(d: ResourcesData): string {
  const nodes = d.plan.nodes ?? []
  const chips = (d.config.relations ?? []).map((e) => {
    const f = nodes.find((n) => n.nodeId === e.from)?.label ?? e.from
    const t = nodes.find((n) => n.nodeId === e.to)?.label ?? e.to
    return `<span class="pf-rel-chip js-rel-chip">${esc(f)} → ${esc(t)} <button class="pf-rel-x" data-delrel="${esc(e.from)}|${esc(e.to)}">✕</button></span>`
  }).join('')
  const nodeOpts = nodes.map((n) => `<option value="${esc(n.nodeId)}">${esc(n.label)}</option>`).join('')
  return `<div class="pf-card"><h2 class="pf-h3">Sequenza (relazioni)</h2>
    <p class="pf-muted">"A → B": una squadra entra in B solo dopo aver finito A.</p>
    ${nodes.length ? pipelineMap(nodes) : ''}
    <div class="pf-rel-chips">${chips}</div>
    <div id="rel-err" class="pf-muted" style="color:var(--color-feedback-danger)"></div>
    <div class="pf-row" style="margin-top:12px">
      <select id="rel-from"><option value="">Da…</option>${nodeOpts}</select>
      <span class="pf-mono">→</span>
      <select id="rel-to"><option value="">A…</option>${nodeOpts}</select>
      <button class="pf-btn pf-btn--primary" id="rel-add">Aggiungi relazione</button>
    </div></div>`
}

/** S17 Wave B — per-node modalità: "Calendario" (turni pianificati dai fine-partita) vs "Libera"
 *  (coda a scorrimento senza orari, per lo steward). Stored on the group (if the node is a group)
 *  or on the resource itself, then re-saved like any other config edit. */
function nodeModeCard(d: ResourcesData): string {
  const nodes = d.plan.nodes ?? []
  if (!nodes.length) return ''
  const rows = nodes.map((n) => {
    const seg = (mode: NodeMode, label: string) => `<button type="button" class="pf-seg__opt${n.mode === mode ? ' pf-seg__opt--active' : ''}" data-mode="${mode}">${label}</button>`
    return `<div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm)">
      <span>${n.icon ? `${esc(n.icon)} ` : ''}${esc(n.label)}</span>
      <span class="pf-seg js-node-mode" data-node="${esc(n.nodeId)}" data-kind="${esc(n.kind)}">
        ${seg('scheduled', 'Calendario')}${seg('free', 'Libera')}
      </span>
    </div>`
  }).join('')
  return `<div class="pf-card"><h2 class="pf-h3">Modalità</h2>
    <p class="pf-muted">Calendario = turni pianificati dai fine-partita; Libera = coda a scorrimento senza orari fissi (per lo steward).</p>
    <div class="pf-stack">${rows}</div></div>`
}

/** S17 Wave B — steward link: a single event-wide token (not per-field like the director links)
 *  that lets the steward check off served teams from `/e3/…#/events/:id/resources` without an
 *  organizer login. Mirrors the director-link generator in schedule.ts. */
function stewardLinkCard(): string {
  return `<div class="pf-card"><h2 class="pf-h3">Link steward</h2>
    <p class="pf-muted">Condividi questo link con lo steward: potrà segnare le squadre servite dal telefono, senza accesso all'area organizzatore.</p>
    <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm)">
      <button type="button" class="pf-btn js-steward-link">Genera link steward</button>
      <span class="js-steward-copied pf-muted"></span>
    </div></div>`
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

/** Move options span EVERY resource for the day (a team lives in exactly one resource now, so moving it
 *  means choosing another resource+slot). Value = `resourceId|slotTime`, or `AUTO` to drop the pin. */
function moveOptions(d: ResourcesData, day: string, team: string): string {
  const cur = (d.config.assignments ?? []).find((a) => a.day === day && a.team === team)
  const groups = d.config.resources.map((r) => {
    const slots = d.plan.turns.find((t) => t.resourceId === r.resourceId && t.day === day)?.slots ?? []
    if (!slots.length) return ''
    const opts = slots.map((s) => {
      const sel = cur && cur.resourceId === r.resourceId && cur.slotTime === s.time ? ' selected' : ''
      return `<option value="${esc(r.resourceId)}|${esc(s.time)}"${sel}>${esc(s.time)}</option>`
    }).join('')
    return `<optgroup label="${resName(r)}">${opts}</optgroup>`
  }).join('')
  return `<option value="AUTO"${cur ? '' : ' selected'}>Auto</option>${groups}`
}

const slotHtml = (s: ResourceSlot, d: ResourcesData, day: string): string => {
  const pct = Math.min(100, Math.round((s.persons / Math.max(1, s.capacity)) * 100))
  // Full roster size per team, to flag a partial portion (team split across rooms): "10p di 14".
  const fullSizeOf = (team: string): number | undefined => d.plan.teams.find((t) => t.team === team)?.size
  return `<div class="pf-res-slot${s.overflow ? ' pf-res-slot--over' : ''}">
    <div class="pf-res-slot__head"><span class="pf-mono">${esc(s.time)}</span>
      <span class="pf-res-gauge"><span class="pf-res-gauge__bar" style="width:${pct}%"></span></span>
      <span class="pf-mono">${s.persons}/${s.capacity}${s.overflow ? ' ⚠' : ''}</span></div>
    <ul class="pf-res-slot__teams">${s.teams.map((t) => { const full = fullSizeOf(t.team); const partial = full != null && t.size < full; return `<li>
      <span>${esc(t.team)} <span class="pf-muted pf-mono">${esc(t.categoryId)} · ${t.size}p${partial ? ` di ${full}` : ''}${t.pinned ? ' · fissato' : ''}</span>${t.served ? ` <span class="pf-pill pf-pill--served">✓ ${esc(t.servedAt ?? '')}</span>` : ''}</span>
      <select class="pf-res-move" data-day="${esc(day)}" data-team="${esc(t.team)}">${moveOptions(d, day, t.team)}</select>
    </li>` }).join('')}</ul>
  </div>`
}

function renderTurns(d: ResourcesData, resourceId: string, day: string): string {
  const slots = d.plan.turns.find((t) => t.resourceId === resourceId && t.day === day)?.slots ?? []
  if (!slots.length) return `<p class="pf-muted">Nessun turno per questa risorsa in questa giornata.</p>`
  return slots.map((s) => slotHtml(s, d, day)).join('')
}

function unassignableCard(d: ResourcesData): string {
  if (!d.plan.unassignable.length) return ''
  const items = d.plan.unassignable.map((u) => `<li>${esc(u.team)} <span class="pf-muted pf-mono">${esc(u.categoryId)} · ${u.size} posti non assegnati · ${esc(u.day)}</span></li>`).join('')
  return `<div class="pf-card" style="border-color:var(--color-feedback-danger)">
    <h2 class="pf-h3">⚠ Posti non assegnati</h2>
    <p class="pf-muted">La capienza totale delle risorse non basta per queste squadre: le persone sono state distribuite su più risorse fin dove possibile, ma alcune restano senza posto. Aumenta la capienza (o aggiungi una risorsa) per coprirle tutte.</p>
    <ul class="pf-stack" style="list-style:none;padding:0">${items}</ul></div>`
}

function turnsSection(d: ResourcesData): string {
  if (!d.config.resources.length) return `<div class="pf-card"><h2 class="pf-h3">Turni proposti</h2><p class="pf-muted">Aggiungi almeno una risorsa.</p></div>`
  if (!d.plan.days.length) return `<div class="pf-card"><h2 class="pf-h3">Turni proposti</h2><p class="pf-muted">Genera prima il calendario: i turni si calcolano dagli orari di fine partita.</p></div>`
  const day0 = d.plan.days[0]!, res0 = d.config.resources[0]!.resourceId
  const dayOpts = d.plan.days.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')
  const nodes = d.plan.nodes ?? []
  const byId = new Map(d.config.resources.map((r) => [r.resourceId, r]))
  // Group the resource selector by plan node (topo order): each optgroup is a group ("Docce") or an
  // ungrouped resource, containing that node's member resources by name.
  const resOpts = nodes.length
    ? nodes.map((n) => {
      const opts = n.memberIds.map((id) => byId.get(id)).filter((r): r is Resource => !!r)
        .map((r) => `<option value="${esc(r.resourceId)}">${resName(r)}</option>`).join('')
      return `<optgroup label="${esc(n.label)}">${opts}</optgroup>`
    }).join('')
    : d.config.resources.map((r) => `<option value="${esc(r.resourceId)}">${resName(r)}</option>`).join('')
  return `<div class="pf-card"><h2 class="pf-h3">Turni proposti</h2>
    <p class="pf-muted">Ogni squadra è assegnata a una sola risorsa; usa "sposta" per spostarla su un'altra risorsa/orario.</p>
    <div class="pf-row"><label>Giornata</label><select id="r-day">${dayOpts}</select>
      <label>Risorsa</label><select id="r-res">${resOpts}</select></div>
    <div id="res-turns" style="margin-top:var(--space-sm)">${renderTurns(d, res0, day0)}</div></div>`
}

export function renderResources(d: ResourcesData): string {
  if (d.locked) return workspaceShell(d.event, 'resources', lockCard('Risorse & logistica'))
  return workspaceShell(d.event, 'resources', `<div id="err"></div>${resourceTable(d.config)}${groupsCard(d)}${relationsCard(d)}${nodeModeCard(d)}${stewardLinkCard()}${sizeEditor(d)}${unassignableCard(d)}${turnsSection(d)}`)
}

function num(root: ParentNode, sel: string): number | undefined { const v = root.querySelector<HTMLInputElement>(sel)?.value ?? ''; const n = Number(v); return v !== '' && n > 0 ? Math.floor(n) : undefined }

export const resourcesScreen: Screen<ResourcesData> = {
  load: async (ctx, p) => {
    const event = await ctx.client.o3.getEvent(p.id)
    if (!ctx.entitlements.hasResources) return { event, config: { resources: [] }, plan: {} as ResourcePlan, locked: true }
    const [config, plan] = await Promise.all([ctx.client.o7.getResources(p.id), ctx.client.o7.getResourcePlan(p.id)])
    return { event, config, plan }
  },
  render: renderResources,
  mount(root, ctx, d) {
    if (d.locked) return // plan-gated
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

    // Groups: pool several same-kind resources ("Docce" = spogliatoio 1 + 2) into a single plan node.
    root.querySelector('#g-add')?.addEventListener('click', () => {
      const icon = (root.querySelector<HTMLInputElement>('#g-icon')?.value ?? '').trim() || undefined
      const name = (root.querySelector<HTMLInputElement>('#g-name')?.value ?? '').trim()
      const memberIds = Array.from(root.querySelector<HTMLSelectElement>('#g-member')?.selectedOptions ?? []).map((o) => o.value)
      if (!name || !memberIds.length) { fail('Indica un nome e almeno una risorsa per il gruppo.'); return }
      const group: ResourceGroup = { groupId: crypto.randomUUID(), name, icon, memberIds }
      void save({ ...d.config, groups: [...(d.config.groups ?? []), group] })
    })
    root.querySelectorAll<HTMLButtonElement>('[data-delgroup]').forEach((b) => b.addEventListener('click', () => {
      const gid = b.dataset.delgroup!
      void save({
        ...d.config,
        groups: (d.config.groups ?? []).filter((g) => g.groupId !== gid),
        relations: (d.config.relations ?? []).filter((e) => e.from !== gid && e.to !== gid),
      })
    }))

    // Relations: order plan nodes ("Docce → Mensa"). Validated client-side (cycle/self-loop) before
    // saving so the organizer gets an inline error instead of a round-trip 422.
    root.querySelector('#rel-add')?.addEventListener('click', () => {
      const relErr = root.querySelector<HTMLElement>('#rel-err')
      if (relErr) relErr.textContent = ''
      const from = root.querySelector<HTMLSelectElement>('#rel-from')?.value ?? ''
      const to = root.querySelector<HTMLSelectElement>('#rel-to')?.value ?? ''
      if (!from || !to) { if (relErr) relErr.textContent = 'Seleziona i due nodi.'; return }
      if (from === to) { if (relErr) relErr.textContent = 'Una relazione non può collegare un nodo a sé stesso.'; return }
      const relations = [...(d.config.relations ?? []), { from, to }]
      if (hasRelationCycle(d.plan.nodes ?? [], relations)) { if (relErr) relErr.textContent = 'Le relazioni contengono un ciclo.'; return }
      void save({ ...d.config, relations })
    })
    root.querySelectorAll<HTMLButtonElement>('[data-delrel]').forEach((b) => b.addEventListener('click', () => {
      const [from, to] = b.dataset.delrel!.split('|')
      void save({ ...d.config, relations: (d.config.relations ?? []).filter((e) => !(e.from === from && e.to === to)) })
    }))
    // Per-node modalità (Wave B): patch the node's mode on its group (if it's a grouped node) or
    // on the underlying resource, then save like any other config edit.
    root.querySelectorAll<HTMLElement>('.js-node-mode').forEach((seg) => {
      const nodeId = seg.dataset.node!, kind = seg.dataset.kind!
      seg.querySelectorAll<HTMLButtonElement>('.pf-seg__opt').forEach((btn) => btn.addEventListener('click', () => {
        const mode = btn.dataset.mode as NodeMode
        if (kind === 'group') {
          void save({ ...d.config, groups: (d.config.groups ?? []).map((g) => g.groupId === nodeId ? { ...g, mode } : g) })
        } else {
          void save({ ...d.config, resources: d.config.resources.map((r) => r.resourceId === nodeId ? { ...r, mode } : r) })
        }
      }))
    })

    // S17 Wave B — steward link: one event-wide token, minted on demand and copied to the
    // clipboard (mirrors the per-field director-link generator in schedule.ts).
    root.querySelector<HTMLButtonElement>('.js-steward-link')?.addEventListener('click', async () => {
      const note = root.querySelector<HTMLElement>('.js-steward-copied')
      try {
        const { token } = await ctx.client.o7.stewardToken(id)
        const url = `${ctx.e3BaseUrl}/e3/?token=${encodeURIComponent(token)}#/events/${encodeURIComponent(id)}/resources`
        const ok = await copyToClipboard(url)
        if (note) note.textContent = ok ? 'Copiato ✓' : 'Copia manuale'
      } catch { if (note) note.textContent = 'Errore, riprova' }
    })

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
      const { day, team } = sel.dataset as { day: string; team: string }
      // A team has at most one assignment per day — drop any existing (on any resource), then re-pin.
      const rest = (d.config.assignments ?? []).filter((a) => !(a.day === day && a.team === team))
      let assignments = rest
      if (sel.value !== 'AUTO') {
        const [resourceId, slotTime] = sel.value.split('|')
        assignments = [...rest, { resourceId: resourceId!, day, team, slotTime: slotTime! }]
      }
      void save({ ...d.config, assignments })
    }))
    daySel?.addEventListener('change', drawTurns)
    resSel?.addEventListener('change', drawTurns)
    wireMoves()
  },
}
