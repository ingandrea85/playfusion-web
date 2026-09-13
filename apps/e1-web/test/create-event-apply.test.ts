import { describe, it, expect, vi } from 'vitest'
import { applyDraft } from '../src/views/create-event'
import type { EventDraft } from '@playfusion/rest-client'

const draft: EventDraft = {
  event: { name: 'F', sportId: 'rugby', participantType: 'team', format: 'festival',
           categorie: ['U10'], dates: { from: '2026-09-13', to: '2026-09-13' }, playbook: 'PB-1' },
  groupsByCategory: { U10: { groups: [{ label: 'Pool A', teamCount: 6 }, { label: 'Pool B', teamCount: 6 }] } },
  schedule: { fields: ['C1'], periods: 1, periodMinutes: 15, breakMinutes: 3, dailyStart: '09:00', groupsCount: 2, legs: 'SINGLE', finalsEnabled: false } as EventDraft['schedule'],
  rationale: 'x', assumptions: [],
}

describe('applyDraft', () => {
  it('creates the event, draws gironi per category, generates the schedule, then navigates — in order', async () => {
    const order: string[] = []
    const client = {
      o3: {
        createEvent: vi.fn(async () => { order.push('create'); return { sportEventId: 'ev-1', status: 'Published' } }),
        drawGironi: vi.fn(async () => { order.push('gironi'); return { groups: [], locked: false } }),
      },
      o7: { generateSchedule: vi.fn(async () => { order.push('schedule'); return {} as any }) },
    } as any
    const navigate = vi.fn(() => order.push('nav'))
    await applyDraft(client, navigate, draft)
    expect(client.o3.createEvent).toHaveBeenCalledWith(draft.event)
    expect(client.o3.drawGironi).toHaveBeenCalledWith('ev-1', 'U10', 2)
    expect(client.o7.generateSchedule).toHaveBeenCalledWith('ev-1', draft.schedule)
    expect(navigate).toHaveBeenCalledWith('#/events/ev-1')
    expect(order).toEqual(['create', 'gironi', 'schedule', 'nav'])
  })
  it('skips the gironi step for a bracket draft (no groupsByCategory)', async () => {
    const bracket: EventDraft = { ...draft, event: { ...draft.event, format: 'bracket' }, groupsByCategory: undefined }
    const client = {
      o3: { createEvent: vi.fn(async () => ({ sportEventId: 'ev-2', status: 'Published' })), drawGironi: vi.fn() },
      o7: { generateSchedule: vi.fn(async () => ({} as any)) },
    } as any
    await applyDraft(client, vi.fn(), bracket)
    expect(client.o3.drawGironi).not.toHaveBeenCalled()
  })
}
)
