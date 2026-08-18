import { describe, it, expect } from 'vitest'
import { listFees } from '../src/read-model.js'
import type { FeeReadStore } from '../src/ports/fee-read-store.js'

const store = (rows: Array<{ registrationId: string; sportEventId: string; status: 'Requested' | 'Paid' }>): FeeReadStore => ({
  listByEvent: async (sportEventId) => rows.filter((r) => r.sportEventId === sportEventId),
})

describe('o12 listFees', () => {
  it('projects fee rows for an event to {registrationId,status}, dropping internal fields', async () => {
    const out = await listFees(store([
      { registrationId: 'r1', sportEventId: 'e1', status: 'Paid' },
      { registrationId: 'r2', sportEventId: 'e1', status: 'Requested' },
      { registrationId: 'r3', sportEventId: 'e2', status: 'Paid' },
    ]))('e1')
    expect(out).toEqual([{ registrationId: 'r1', status: 'Paid' }, { registrationId: 'r2', status: 'Requested' }])
  })
})
