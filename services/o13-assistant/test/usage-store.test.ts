import { describe, it, expect, vi } from 'vitest'
import { DynamoUsageStore } from '../src/adapters/dynamodb-usage-store.js'

describe('DynamoUsageStore', () => {
  it('count returns 0 when the month bucket is absent', async () => {
    const db = { send: vi.fn().mockResolvedValue({}) } as any
    expect(await new DynamoUsageStore(db, 'T').count('org', '2026-09')).toBe(0)
  })
  it('count returns the stored count', async () => {
    const db = { send: vi.fn().mockResolvedValue({ Item: { count: 7 } }) } as any
    expect(await new DynamoUsageStore(db, 'T').count('org', '2026-09')).toBe(7)
  })
  it('increment issues an ADD on the (org, month) key', async () => {
    const send = vi.fn().mockResolvedValue({})
    await new DynamoUsageStore({ send } as any, 'T').increment('org', '2026-09')
    const input = send.mock.calls[0][0].input
    expect(input.Key).toEqual({ organizationId: 'org', month: '2026-09' })
    expect(input.UpdateExpression).toContain('ADD #c :one')
  })
})
