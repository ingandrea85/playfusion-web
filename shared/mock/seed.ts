import type { State, ScheduledMatch, StandingRow, FinalMatch, Competition, Schedule, GroupSlot, Category, TournamentEvent } from './types'
import { recomputeStandings, resolveFinals } from './derive'
import { buildFinals } from './finals'

// One demo event: single category, single girone "Girone A", SINGLE_GROUP_CROSSOVER
// final (1ª vs 2ª). `results` are [homeIdx, homeScore, awayIdx, awayScore] over `teams`.
function demoEvent(id: string, name: string, teams: string[], results: [number, number, number, number][], qualifiers = 2, thirdPlace = false): {
  event: TournamentEvent; category: Category; competition: Competition; schedule: Schedule;
  groupSlots: GroupSlot[]; matches: ScheduledMatch[]; standings: StandingRow[]; finals: FinalMatch[]
} {
  const catId = `${id}-cat`
  const event: TournamentEvent = {
    id, organizationId: 'org-1', name, sport: 'Calcio', location: 'Campo Demo',
    startDate: '2026-09-01', startTime: '09:00', endDate: '2026-09-01', template: 'PB-1',
    registrationsOpen: false, tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
    playbook: 'PB-1',
  }
  const category: Category = { id: catId, eventId: id, name: 'Unica', maxTeams: teams.length }
  const competition: Competition = {
    id: `${id}-comp`, eventId: id, categoryId: catId, format: 'GROUPS_KNOCKOUT', legs: 'SINGLE',
    groupsCount: 1, qualifiersPerGroup: qualifiers, finalsType: 'SINGLE_GROUP_CROSSOVER', groupsLocked: true,
    thirdPlace,
  }
  const schedule: Schedule = {
    eventId: id, status: 'PUBLISHED', config: {
      dailyStart: '09:00', slotsPerDay: 4, finalsDate: '2026-09-01',
      byCategory: { [catId]: { fields: ['Campo 1'], periods: 2, periodMinutes: 20, breakMinutes: 10 } },
    },
  }
  const groupSlots: GroupSlot[] = teams.map(t => ({ eventId: id, categoryId: catId, team: t, groupLabel: 'Girone A' }))
  const matches: ScheduledMatch[] = results.map((r, i) => ({
    id: `${id}-m${i + 1}`, eventId: id, categoryId: catId, groupLabel: 'Girone A',
    day: '2026-09-01', time: '09:00', field: 'Campo 1',
    home: teams[r[0]], away: teams[r[2]], homeScore: r[1], awayScore: r[3],
  }))
  const standings: StandingRow[] = teams.map(t => ({
    eventId: id, categoryId: catId, groupLabel: 'Girone A', team: t,
    played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
  }))
  const finals: FinalMatch[] = buildFinals(['Girone A'], qualifiers, 'SINGLE_GROUP_CROSSOVER', thirdPlace).map((d, i) => ({
    id: `${id}-f${i + 1}`, eventId: id, categoryId: catId, bracketLabel: d.bracketLabel, round: d.round, order: d.order,
    home: d.home, away: d.away, day: '2026-09-01', time: '11:00', field: 'Campo 1',
    homeResolved: null, awayResolved: null, homeScore: null, awayScore: null, homeShootout: null, awayShootout: null,
  }))
  return { event, category, competition, schedule, groupSlots, matches, standings, finals }
}

const DEMOS = [
  demoEvent('evt-tie-h2h', 'Demo · Scontri diretti', ['Alfa', 'Bravo', 'Charlie', 'Delta'],
    [[0, 1, 1, 0], [0, 1, 2, 0], [3, 1, 0, 0], [1, 1, 2, 0], [1, 1, 3, 0], [2, 1, 3, 0]]),
  demoEvent('evt-tie-avulsa', 'Demo · Classifica avulsa', ['Alfa', 'Bravo', 'Charlie', 'Delta'],
    [[0, 3, 1, 0], [1, 1, 2, 0], [2, 1, 0, 0], [0, 1, 3, 0], [1, 5, 3, 0], [2, 3, 3, 0]]),
  demoEvent('evt-tie-dr', 'Demo · Differenza reti', ['Alfa', 'Bravo', 'Charlie'],
    [[0, 1, 1, 1], [0, 3, 2, 0], [1, 1, 2, 0]]),
  demoEvent('evt-tie-gf', 'Demo · Reti fatte', ['Alfa', 'Bravo', 'Charlie'],
    [[0, 2, 1, 2], [0, 3, 2, 1], [1, 2, 2, 0]]),
  demoEvent('evt-tie-open', 'Demo · Parità irrisolta', ['Alfa', 'Bravo', 'Charlie'],
    [[0, 1, 1, 1], [0, 2, 2, 0], [1, 2, 2, 0]]),
  demoEvent('evt-finals', 'Demo · Tabellone (semifinali)', ['Alfa', 'Bravo', 'Charlie', 'Delta'],
    [[0, 1, 1, 0], [0, 1, 2, 0], [0, 1, 3, 0], [1, 1, 2, 0], [1, 1, 3, 0], [2, 1, 3, 0]], 4, true),
]

export function buildSeed(): State {
  const state: State = {
    events: [{
      id: 'evt-1', organizationId: 'org-1', name: 'Torneo Estivo Memorial', sport: 'Calcio',
      location: 'Centro Sportivo Comunale · Rivalta (TO)',
      startDate: '2026-08-29', startTime: '09:00', endDate: '2026-08-30', template: 'PB-1',
      registrationsOpen: true,
      tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
      playbook: 'PB-1',
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
      { id: 'comp-1', eventId: 'evt-1', categoryId: 'cat-1', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT', groupsLocked: false },
      { id: 'comp-2', eventId: 'evt-1', categoryId: 'cat-2', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT', groupsLocked: false },
      { id: 'comp-3', eventId: 'evt-1', categoryId: 'cat-3', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT', groupsLocked: false },
    ],
    schedules: [
      { eventId: 'evt-1', status: 'NONE', config: {
        dailyStart: '09:00', slotsPerDay: 8, finalsDate: '2026-08-30',
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
    groupSlots: [],
    tieOverrides: [],
    organizations: [
      { id: 'org-1', name: 'ASD Memorial Rivalta', status: 'ACTIVE', modules: ['M-Core', 'M-Compete', 'M-Broadcast', 'M-Payments'] },
      { id: 'org-2', name: 'Polisportiva Chierese', status: 'ACTIVE', modules: ['M-Core', 'M-Compete'] },
      { id: 'org-3', name: 'US Basse Valle', status: 'SUSPENDED', modules: ['M-Core', 'M-Compete', 'M-Broadcast'] },
      { id: 'org-4', name: 'GS Collina Padel', status: 'ACTIVE', modules: ['M-Core', 'M-Compete', 'M-Payments', 'M-Billing'] },
    ],
    subscriptions: [
      { organizationId: 'org-1', plan: 'PRO', status: 'ACTIVE', renewsOn: '2027-01-10' },
      { organizationId: 'org-2', plan: 'FREE', status: 'TRIAL', renewsOn: '2026-08-15' },
      { organizationId: 'org-3', plan: 'PRO', status: 'PAST_DUE', renewsOn: '2026-07-01' },
      { organizationId: 'org-4', plan: 'BUSINESS', status: 'ACTIVE', renewsOn: '2027-03-20' },
    ],
    announcements: [
      { id: 'ann-1', eventId: 'evt-1', categoryId: null, pinned: true, source: 'ORGANIZER',
        title: 'Iscrizioni in chiusura', body: 'Ultimi giorni per iscriversi: gironi in pubblicazione a breve.',
        createdAt: '2026-07-14T09:00:00.000Z' },
      { id: 'ann-2', eventId: 'evt-1', categoryId: 'cat-1', pinned: false, source: 'ORGANIZER',
        title: 'U10 · cambio campo', body: 'Le gare U10 di sabato si giocano su Campo B.',
        createdAt: '2026-07-13T15:30:00.000Z' },
      { id: 'ann-3', eventId: 'evt-1', categoryId: null, pinned: false, source: 'ORGANIZER',
        title: 'Ritrovo squadre', body: 'Presentarsi 30 minuti prima della prima gara per il ritiro pettorine.',
        createdAt: '2026-07-12T08:00:00.000Z' },
    ],
    users: [],
    session: null,
  }
  for (const d of DEMOS) {
    state.events.push(d.event)
    state.categories.push(d.category)
    state.competitions.push(d.competition)
    state.schedules.push(d.schedule)
    state.groupSlots.push(...d.groupSlots)
    state.scheduledMatches.push(...d.matches)
    state.standings.push(...d.standings)
    state.finals.push(...d.finals)
  }
  for (const d of DEMOS) { recomputeStandings(state, d.event.id); resolveFinals(state, d.event.id) }
  state.events.push({
    id: 'evt-direct', organizationId: 'org-1', name: 'Demo · Iscrizione diretta', sport: 'Calcio',
    location: 'Palasport Comunale', startDate: '2026-09-05', startTime: '09:00', endDate: '2026-09-05',
    template: 'PB-1', playbook: 'PB-2', registrationsOpen: false,
    tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
  })
  state.categories.push({ id: 'evt-direct-cat', eventId: 'evt-direct', name: 'Open', maxTeams: 8 })
  ;['Tigri Rosse', 'Falchi Blu', 'Leoni Verdi', 'Aquile Nere'].forEach((t, i) => state.registrations.push({
    id: `reg-direct-${i + 1}`, eventId: 'evt-direct', categoryId: 'evt-direct-cat', teamName: t,
    contactName: '', contactPhone: '', contactEmail: '', status: 'CONFIRMED', paymentStatus: 'UNPAID',
    createdAt: '2026-08-01T09:00:00.000Z',
  }))
  return state
}
