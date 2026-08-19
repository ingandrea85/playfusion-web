import { renderStandings } from '@playfusion/app-shell'
import type { EventDetail, GroupStanding } from '@playfusion/rest-client'
import type { Screen } from '../view.js'
import { workspaceShell } from './workspace.js'

export interface StandingsData { event: EventDetail; standings: GroupStanding[] }

const catName = (c: string): string => c

export function renderStandingsView(data: StandingsData): string {
  return workspaceShell(data.event, 'standings',
    `<div class="pf-card"><h2 class="pf-h3">Classifiche</h2>${renderStandings(data.standings, catName)}</div>`)
}

export const standingsScreen: Screen<StandingsData> = {
  load: async (ctx, p) => {
    const [event, standings] = await Promise.all([ctx.client.o3.getEvent(p.id), ctx.client.o7.getStandings(p.id)])
    return { event, standings }
  },
  render: renderStandingsView,
}
