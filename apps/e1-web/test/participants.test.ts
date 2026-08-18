import { describe, it, expect } from 'vitest'
import { renderParticipants } from '../src/views/participants'

const event = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published' as const, playbook: 'PB-1' as const }

describe('participants render', () => {
  it('lists confirmed participants with fee status and a pay button when unpaid', () => {
    const html = renderParticipants({
      event,
      confirmed: [
        { registrationId: 'r1', participantRef: 'Team A', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' },
        { registrationId: 'r2', participantRef: 'Team B', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' },
      ],
      fees: { r1: 'Paid', r2: 'Requested' },
    })
    expect(html).toContain('Team A'); expect(html).toContain('Pagata')
    expect(html).toContain('Team B'); expect(html).toContain('Richiesta')
    expect(html).toContain('data-pay="r2"')     // unpaid → pay button
    expect(html).not.toContain('data-pay="r1"') // paid → no pay button
  })
  it('shows an empty-state when there are no confirmed participants', () => {
    expect(renderParticipants({ event, confirmed: [], fees: {} })).toMatch(/Nessun partecipante/i)
  })
})
