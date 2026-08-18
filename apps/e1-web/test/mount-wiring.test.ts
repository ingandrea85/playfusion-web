// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { participantsScreen, renderParticipants } from '../src/views/participants'

describe('participants mount wiring', () => {
  it('clicking pay calls o12.payFee then refresh', async () => {
    const payFee = vi.fn().mockResolvedValue({})
    const refresh = vi.fn()
    const ctx = { client: { o12: { payFee } } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const data = { event: { sportEventId: 'e1', sport: 's', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published' as const, playbook: 'PB-1' as const },
      confirmed: [{ registrationId: 'r2', participantRef: 'B', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' as const }], fees: { r2: 'Requested' as const } }
    const root = document.createElement('div'); root.innerHTML = renderParticipants(data)
    participantsScreen.mount!(root, ctx as any, data)
    root.querySelector<HTMLButtonElement>('[data-pay="r2"]')!.click()
    await vi.waitFor(() => expect(payFee).toHaveBeenCalledWith('r2'))
    expect(refresh).toHaveBeenCalled()
  })
})
