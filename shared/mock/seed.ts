import type { State } from './types'

export function buildSeed(): State {
  return {
    events: [{
      id: 'evt-1', name: 'Torneo Estivo Memorial', sport: 'Calcio',
      location: 'Centro Sportivo Comunale · Rivalta (TO)',
      startDate: '2026-08-29', startTime: '09:00', endDate: '2026-08-30', template: 'PB-1',
      registrationsOpen: true,
    }],
    categories: [
      { id: 'cat-1', eventId: 'evt-1', name: 'U10', maxTeams: 8 },
      { id: 'cat-2', eventId: 'evt-1', name: 'U12', maxTeams: 8 },
      { id: 'cat-3', eventId: 'evt-1', name: 'U14', maxTeams: 6 },
    ],
    registrations: [
      { id: 'reg-1', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'ASD Aurora',
        contactName: 'Luigi Verdi', contactPhone: '340 1112223', contactEmail: 'l.verdi@asdaurora.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-10T09:00:00.000Z' },
      { id: 'reg-2', eventId: 'evt-1', categoryId: 'cat-2', teamName: 'Polisportiva San Marco',
        contactName: 'Anna Bianchi', contactPhone: '347 4445556', contactEmail: 'anna.bianchi@sanmarco.it', status: 'CONFIRMED', paymentStatus: 'UNPAID', createdAt: '2026-07-11T14:30:00.000Z' },
      { id: 'reg-3', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'GS Rivalta',
        contactName: 'Marco Neri', contactPhone: '333 7778889', contactEmail: 'mneri@gsrivalta.it', status: 'PENDING', paymentStatus: 'UNPAID', createdAt: '2026-07-12T08:15:00.000Z' },
      { id: 'reg-4', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'Juniores Valsusa',
        contactName: 'Paolo Ginnasi', contactPhone: '340 2223334', contactEmail: 'p.ginnasi@juniores.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T10:00:00.000Z' },
      { id: 'reg-5', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'Real Collina',
        contactName: 'Sara Conti', contactPhone: '345 3334445', contactEmail: 's.conti@realcollina.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T11:00:00.000Z' },
      { id: 'reg-6', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'Sporting Chieri',
        contactName: 'Davide Riva', contactPhone: '346 4445556', contactEmail: 'd.riva@sportingchieri.it', status: 'CONFIRMED', paymentStatus: 'UNPAID', createdAt: '2026-07-12T12:00:00.000Z' },
      { id: 'reg-7', eventId: 'evt-1', categoryId: 'cat-2', teamName: 'Atletico Basse',
        contactName: 'Elena Fossati', contactPhone: '347 5556667', contactEmail: 'e.fossati@atleticobasse.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T13:00:00.000Z' },
      { id: 'reg-8', eventId: 'evt-1', categoryId: 'cat-2', teamName: 'Sporting Nichelino',
        contactName: 'Franco Massa', contactPhone: '348 6667778', contactEmail: 'f.massa@sportingnichelino.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T14:00:00.000Z' },
      { id: 'reg-9', eventId: 'evt-1', categoryId: 'cat-2', teamName: 'Pol. Santena',
        contactName: 'Giulia Mora', contactPhone: '349 7778889', contactEmail: 'g.mora@polsantena.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T15:00:00.000Z' },
      { id: 'reg-10', eventId: 'evt-1', categoryId: 'cat-3', teamName: 'Virtus Moncalieri',
        contactName: 'Luca Ferro', contactPhone: '340 8889990', contactEmail: 'l.ferro@virtusmoncalieri.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T16:00:00.000Z' },
      { id: 'reg-11', eventId: 'evt-1', categoryId: 'cat-3', teamName: 'Pol. Trofarello',
        contactName: 'Chiara Alba', contactPhone: '341 9990001', contactEmail: 'c.alba@poltrofarello.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T17:00:00.000Z' },
      { id: 'reg-12', eventId: 'evt-1', categoryId: 'cat-3', teamName: 'Calcio Bra Giovani',
        contactName: 'Marco Sala', contactPhone: '342 0001112', contactEmail: 'm.sala@calciobra.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T18:00:00.000Z' },
    ],
    competitions: [
      { id: 'comp-1', eventId: 'evt-1', categoryId: 'cat-1', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT' },
      { id: 'comp-2', eventId: 'evt-1', categoryId: 'cat-2', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT' },
      { id: 'comp-3', eventId: 'evt-1', categoryId: 'cat-3', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT' },
    ],
    schedules: [
      { eventId: 'evt-1', status: 'NONE', config: {
        dailyStart: '09:00', slotsPerDay: 8,
        byCategory: {
          'cat-1': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
          'cat-2': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
          'cat-3': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
        },
      } },
    ],
    scheduledMatches: [],
    standings: [],
    finals: [],
  }
}
