import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('o5 api', () => {
  it('listRegistrations passes ?state= when given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o5.listRegistrations('ev1', 'Confirmed')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o5/events/ev1/registrations?state=Confirmed')
  })
  it('listRegistrations omits the query when no state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o5.listRegistrations('ev1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o5/events/ev1/registrations')
  })
  it('confirmRegistration POSTs the confirm sub-path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ registrationId: 'r', participantRef: 'p', sportEventId: 'ev1', categoria: 'U10', status: 'Confirmed' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o5.confirmRegistration('r')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o5/registrations/r/confirm')
    expect(out.status).toBe('Confirmed')
  })
  it('openRegistrationWindow POSTs the :open sub-path with capacities', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ sportEventId: 'ev1', state: 'Open' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o5.openRegistrationWindow('ev1', { U10: 8 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o5/events/ev1/registration-window:open')
    expect(JSON.parse(init.body)).toEqual({ capacities: { U10: 8 } })
  })
})
