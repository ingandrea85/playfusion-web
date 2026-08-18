// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { participantsScreen, renderParticipants } from '../src/views/participants'

describe('participants mount does not accumulate listeners across refresh', () => {
  it('clicking pay once after a simulated refresh calls payFee exactly once', async () => {
    const payFee = vi.fn().mockResolvedValue({})
    const refresh = vi.fn()
    const ctx = { client: { o12: { payFee } } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const data = {
      event: { sportEventId: 'e1', sport: 's', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published' as const },
      confirmed: [{ registrationId: 'r2', participantRef: 'B', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' as const }],
      fees: { r2: 'Requested' as const },
    }
    const root = document.createElement('div')

    // First mount, mimicking runScreen(root, ctx, params, participantsScreen)
    root.innerHTML = renderParticipants(data)
    participantsScreen.mount!(root, ctx as any, data)

    // Simulate a refresh: runScreen re-runs on the SAME root — root.innerHTML replaces
    // children (and any listeners bound to them), then mount() is called again. A listener
    // bound to the persistent root itself would survive this and accumulate.
    root.innerHTML = renderParticipants(data)
    participantsScreen.mount!(root, ctx as any, data)

    root.querySelector<HTMLButtonElement>('[data-pay="r2"]')!.click()
    await vi.waitFor(() => expect(payFee).toHaveBeenCalled())

    expect(payFee).toHaveBeenCalledTimes(1)
    expect(payFee).toHaveBeenCalledWith('r2')
  })
})
