import { esc, renderPublicTopbar } from '@playfusion/app-shell'
import type { EventDetail, O7Api, PlanNodeInfo, ResourcePlan, ResourceSlot } from '@playfusion/rest-client'

/** B7 — public E3 "resource steward" board: a magic-link holder (docce/mensa attendant) checks
 *  teams off as they consume each resource. Nodes render in `plan.nodes` topo (pipeline) order,
 *  mirroring the organizer's read-only pipeline map (e1-web resources.ts) but with a tappable
 *  check-off instead of a "move" select — the steward's job is marking done, not scheduling. */

const pendingFor = (plan: ResourcePlan, nodeId: string, day: string, team: string) =>
  plan.pending.find((p) => p.nodeId === nodeId && p.day === day && p.team === team)

function scheduledTeamRow(nodeId: string, day: string, team: { team: string; categoryId: string }, served: boolean, plan: ResourcePlan): string {
  const pending = pendingFor(plan, nodeId, day, team.team)
  if (pending) {
    return `<li class="pf-checkoff-row pf-checkoff-row--pending">
      <span>${esc(team.team)} <span class="pf-muted pf-mono">${esc(team.categoryId)}</span></span>
      <span class="pf-muted pf-mono">in attesa · ${esc(pending.waitingFor)}</span>
    </li>`
  }
  return `<li class="pf-checkoff-row${served ? ' pf-checkoff-row--served' : ''}">
    <span>${esc(team.team)} <span class="pf-muted pf-mono">${esc(team.categoryId)}</span></span>
    <button type="button" class="pf-btn${served ? ' pf-btn--primary' : ''} js-checkoff" data-node="${esc(nodeId)}" data-team="${esc(team.team)}" data-served="${served ? '1' : '0'}">${served ? '✓ Fatto' : 'Segna fatto'}</button>
  </li>`
}

function scheduledSlot(nodeId: string, day: string, slot: ResourceSlot, plan: ResourcePlan): string {
  return `<div class="pf-res-slot">
    <div class="pf-res-slot__head"><span class="pf-mono">${esc(slot.time)}</span>
      <span class="pf-mono">${slot.persons}/${slot.capacity}${slot.overflow ? ' ⚠' : ''}</span></div>
    <ul class="pf-res-slot__teams" style="list-style:none;padding:0">${slot.teams.map((t) => scheduledTeamRow(nodeId, day, t, !!t.served, plan)).join('')}</ul>
  </div>`
}

function scheduledNode(node: PlanNodeInfo, day: string, plan: ResourcePlan): string {
  const slots = plan.turns.filter((t) => t.nodeId === node.nodeId && t.day === day).flatMap((t) => t.slots)
  const body = slots.length
    ? slots.map((s) => scheduledSlot(node.nodeId, day, s, plan)).join('')
    : `<p class="pf-muted">Nessun turno per questa giornata.</p>`
  return `<div class="pf-card"><h2 class="pf-h3">${node.icon ? `${esc(node.icon)} ` : ''}${esc(node.label)}</h2>${body}</div>`
}

function freeNode(node: PlanNodeInfo, day: string, plan: ResourcePlan): string {
  const list = plan.freeLists.find((f) => f.nodeId === node.nodeId && f.day === day)
  const teams = list?.teams ?? []
  const servedCount = teams.filter((t) => t.served).length
  const rows = teams.map((t) => {
    const pending = pendingFor(plan, node.nodeId, day, t.team)
    if (pending) {
      return `<li class="pf-checkoff-row pf-checkoff-row--pending">
        <span>${esc(t.team)} <span class="pf-muted pf-mono">${esc(t.categoryId)}</span></span>
        <span class="pf-muted pf-mono">in attesa · ${esc(pending.waitingFor)}</span>
      </li>`
    }
    const served = !!t.served
    return `<li class="pf-checkoff-row${served ? ' pf-checkoff-row--served' : ''}">
      <span>${esc(t.team)} <span class="pf-muted pf-mono">${esc(t.categoryId)}</span></span>
      <button type="button" class="pf-btn${served ? ' pf-btn--primary' : ''} js-checkoff" data-node="${esc(node.nodeId)}" data-team="${esc(t.team)}" data-served="${served ? '1' : '0'}">${served ? '✓ Fatto' : 'Segna fatto'}</button>
    </li>`
  }).join('')
  return `<div class="pf-card"><h2 class="pf-h3">${node.icon ? `${esc(node.icon)} ` : ''}${esc(node.label)}
      <span class="pf-mono pf-muted">${servedCount}/${teams.length}</span></h2>
    <ul class="pf-res-slot__teams" style="list-style:none;padding:0">${rows}</ul></div>`
}

/** Renders the steward board: one card per plan node, in `plan.nodes` topo order. */
export function renderResourceSteward(event: EventDetail, plan: ResourcePlan, day: string): string {
  const nodes = [...plan.nodes].sort((a, b) => a.topoIndex - b.topoIndex)
  const body = nodes.map((n) => (n.mode === 'free' ? freeNode(n, day, plan) : scheduledNode(n, day, plan))).join('')
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">Check-off risorse</div><h1>${esc(event.name ?? event.sport)}</h1>
        <div class="pf-mono pf-muted">${esc(day)}</div></div>
      <div id="rs-err"></div>
      <div id="rs-body">${body}</div>
    </main>`
}

/** Wires every `.js-checkoff` toggle: optimistic class/label flip, then mark/unmark via o7,
 *  then re-fetch the plan (checkoffs can shift pending → active for downstream nodes) and
 *  re-render the whole board. A failed call reverts the optimistic flip and shows an error. */
export function wireResourceSteward(root: ParentNode, o7: O7Api, eventId: string, day: string, plan: ResourcePlan): void {
  const err = root.querySelector('#rs-err')
  const showError = () => { if (err) err.innerHTML = `<div class="pf-card" style="border-color:var(--color-feedback-danger)">Operazione non riuscita. Riprova.</div>` }
  const clearError = () => { if (err) err.textContent = '' }

  let current = plan

  function draw() {
    const body = root.querySelector('#rs-body')
    if (!body) return
    const nodes = [...current.nodes].sort((a, b) => a.topoIndex - b.topoIndex)
    body.innerHTML = nodes.map((n) => (n.mode === 'free' ? freeNode(n, day, current) : scheduledNode(n, day, current))).join('')
    wire()
  }

  function wire() {
    root.querySelectorAll<HTMLButtonElement>('.js-checkoff').forEach((btn) => {
      btn.addEventListener('click', async () => {
        clearError()
        const nodeId = btn.dataset.node!
        const team = btn.dataset.team!
        const wasServed = btn.dataset.served === '1'
        // Optimistic flip: flip the class/label immediately, then confirm with the server.
        btn.dataset.served = wasServed ? '0' : '1'
        btn.classList.toggle('pf-btn--primary', !wasServed)
        btn.textContent = wasServed ? 'Segna fatto' : '✓ Fatto'
        btn.disabled = true
        try {
          if (wasServed) {
            await o7.unmarkCheckoff(eventId, nodeId, day, team)
          } else {
            await o7.markCheckoff(eventId, { sportEventId: eventId, nodeId, day, team, servedAt: new Date().toISOString() })
          }
          const [freshPlan] = await Promise.all([o7.getResourcePlan(eventId), o7.listCheckoffs(eventId)])
          current = freshPlan
          draw()
        } catch {
          // Revert the optimistic flip.
          btn.dataset.served = wasServed ? '1' : '0'
          btn.classList.toggle('pf-btn--primary', wasServed)
          btn.textContent = wasServed ? '✓ Fatto' : 'Segna fatto'
          btn.disabled = false
          showError()
        }
      })
    })
  }

  wire()
}
