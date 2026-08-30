import type { EventDetail, ScheduleConfig } from '@playfusion/rest-client'
import { previewDraws, formatExplainer, type FormulaInput } from '@playfusion/finals-format'
import { renderPublicTopbar, renderBracket, esc } from '@playfusion/app-shell'

/** Resolve a category's finals settings into a formula input: the byCategory override else the
 *  top-level defaults; solo-tabellone events seed straight from the participants. `count` = confirmed
 *  team/player count for the category (drives the preview's numbers). */
function inputFor(event: EventDetail, config: ScheduleConfig, categoria: string, count: number): FormulaInput {
  const cc = config.byCategory?.[categoria] ?? config
  if (event.format === 'bracket') return { solo: true, participants: count, thirdPlace: cc.finalsThirdPlace }
  return {
    finalsType: cc.finalsFormatId ? undefined : cc.finalsType,
    groups: config.groupsCount || 1,
    participants: count,
    qualifiersPerGroup: cc.finalsQualifiersPerGroup,
    finalsTeamsToBracket: cc.finalsTeamsToBracket,
    thirdPlace: cc.finalsThirdPlace,
  }
}

const catName = (): string => 'Tabellone'

/** Public, read-only "Formula del torneo": per category, the human explainer + the structural bracket
 *  compiled from the current numbers. Lets spectators understand the path before matches are played. */
export function renderPublicFormula(event: EventDetail, config: ScheduleConfig, teamsByCat: Record<string, number>): string {
  const id = encodeURIComponent(event.sportEventId)
  const cards = event.categorie.map((c) => {
    const cc = config.byCategory?.[c] ?? config
    const input = inputFor(event, config, c, teamsByCat[c] ?? 0)
    const explain = `<p class="pf-formula__explain">💡 ${esc(formatExplainer(input))}</p>`
    const custom = event.format !== 'bracket' && cc.finalsFormatId
    const draws = custom ? [] : previewDraws(input)
    const preview = draws.length ? renderBracket(draws.map((d) => ({ ...d, categoryId: 'preview' })), catName) : ''
    const note = custom ? `<p class="pf-muted">Formato personalizzato: il tabellone completo appare a torneo avviato.</p>` : ''
    return `<div class="pf-card"><div class="pf-calday__head pf-mono">${esc(c)}</div>${explain}${preview}${note}</div>`
  }).join('')
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">${esc(event.name ?? event.sport)}</div><h1>Formula del torneo</h1></div>
      ${event.categorie.length ? cards : '<p class="pf-muted">Nessuna categoria.</p>'}
      <div class="pf-row"><a class="pf-btn" href="#/events/${id}">← Torna all'evento</a></div>
    </main>`
}
