import { describe, it, expect } from 'vitest'
import type { EventDetail, ScheduledMatchView, ResourceConfig, ResourcePlan } from '@playfusion/rest-client'
import { calendarSheets, resourceSheets } from '../src/views/export'

const event = { sportEventId: 'e1', name: 'Festa', sport: 'calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published' as const, playbook: 'PB-2' as const }
const m = (over: Partial<ScheduledMatchView>): ScheduledMatchView =>
  ({ id: 'm', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'Campo A', home: 'Leoni', away: 'Aquile', ...over })

describe('calendarSheets', () => {
  it('maps a competitive match to fixed columns with score + status', () => {
    const [cal] = calendarSheets(event as EventDetail, [m({ homeScore: 3, awayScore: 1, status: 'FINISHED' })])
    expect(cal!.headers).toEqual(['Giornata', 'Ora', 'Campo', 'Categoria', 'Fase', 'Casa', 'Ospite', 'Risultato', 'Stato'])
    expect(cal!.rows[0]).toEqual(['2026-09-01', '09:00', 'Campo A', 'U10', 'Girone A', 'Leoni', 'Aquile', '3–1', 'Terminata'])
  })
  it('a festival match has NO score and a "giocata"/"da giocare" status (uniform columns)', () => {
    const [cal] = calendarSheets(event as EventDetail, [m({ phase: 'FESTIVAL', groupLabel: '', status: 'FINISHED' }), m({ phase: 'FESTIVAL', groupLabel: '', id: 'm2' })])
    expect(cal!.rows[0]![7]).toBe('')        // Risultato empty
    expect(cal!.rows[0]![8]).toBe('Giocata')
    expect(cal!.rows[1]![8]).toBe('Da giocare')
  })
  it('adds a "Squadre iscritte" sheet from the confirmed teams', () => {
    const sheets = calendarSheets(event as EventDetail, [], [{ categoria: 'U10', name: 'Leoni' }, { categoria: 'U10', name: 'Aquile' }])
    expect(sheets).toHaveLength(2)
    expect(sheets[1]!.name).toBe('Squadre iscritte')
    expect(sheets[1]!.rows).toEqual([['U10', 'Aquile'], ['U10', 'Leoni']]) // sorted
  })
})

describe('resourceSheets', () => {
  const config: ResourceConfig = {
    resources: [{ resourceId: 's1', name: 'Doccia 1', occupancyMinutes: 30, capacityPersons: 10, offsetMinutes: 0 }],
    groups: [{ groupId: 'docce', name: 'Docce', memberIds: ['s1'] }],
    relations: [{ from: 'docce', to: 'mensa' }],
  }
  const plan = {
    days: ['2026-09-01'], defaultTeamSize: 14, teams: [], unassignable: [], finishesByDay: {}, freeLists: [], pending: [],
    nodes: [{ nodeId: 'docce', kind: 'group', label: 'Docce', memberIds: ['s1'], mode: 'scheduled', topoIndex: 0, predecessorIds: [] }, { nodeId: 'mensa', kind: 'resource', label: 'Mensa', memberIds: ['mensa'], mode: 'free', topoIndex: 1, predecessorIds: ['docce'] }],
    turns: [{ resourceId: 's1', resourceName: 'Doccia 1', day: '2026-09-01', nodeId: 'docce', topoIndex: 0, slots: [{ time: '10:30', capacity: 10, persons: 10, overflow: false, teams: [{ team: 'Leoni', categoryId: 'U10', size: 10, served: true, servedAt: '10:34' }] }] }],
  } as unknown as ResourcePlan

  it('produces Turni + Risorse + Gruppi/sequenza sheets', () => {
    const [turni, risorse, seq] = resourceSheets(event as EventDetail, config, plan)
    expect(turni!.name).toBe('Turni')
    expect(turni!.rows[0]).toEqual(['2026-09-01', '10:30', 'Docce', 'Doccia 1', 'Leoni', 10, 'Servita 10:34'])
    expect(risorse!.rows[0]).toEqual(['Doccia 1', 10, 30, 0])
    expect(seq!.rows).toContainEqual(['Gruppo', 'Docce', 'Doccia 1'])
    expect(seq!.rows).toContainEqual(['Sequenza', 'Docce → Mensa', ''])
  })
})
