import type { State } from './types'

export function buildSeed(): State {
  return {
    events: [{
      id: 'evt-1', name: 'Torneo Estivo Memorial', sport: 'Calcio',
      startDate: '2026-08-29', endDate: '2026-08-30', template: 'PB-1',
      registrationsOpen: true,
    }],
    categories: [
      { id: 'cat-1', eventId: 'evt-1', name: 'U10', maxTeams: 8 },
      { id: 'cat-2', eventId: 'evt-1', name: 'U12', maxTeams: 8 },
      { id: 'cat-3', eventId: 'evt-1', name: 'U14', maxTeams: 6 },
    ],
    registrations: [
      { id: 'reg-1', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'ASD Aurora',
        contactName: 'Luigi Verdi', contactPhone: '340 1112223', contactEmail: 'l.verdi@asdaurora.it', status: 'CONFIRMED',
        paymentStatus: 'PAID', createdAt: '2026-07-10T09:00:00.000Z' },
      { id: 'reg-2', eventId: 'evt-1', categoryId: 'cat-2', teamName: 'Polisportiva San Marco',
        contactName: 'Anna Bianchi', contactPhone: '347 4445556', contactEmail: 'anna.bianchi@sanmarco.it', status: 'CONFIRMED',
        paymentStatus: 'UNPAID', createdAt: '2026-07-11T14:30:00.000Z' },
      { id: 'reg-3', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'GS Rivalta',
        contactName: 'Marco Neri', contactPhone: '333 7778889', contactEmail: 'mneri@gsrivalta.it', status: 'PENDING',
        paymentStatus: 'UNPAID', createdAt: '2026-07-12T08:15:00.000Z' },
    ],
  }
}
