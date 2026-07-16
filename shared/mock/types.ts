export type RegStatus = 'PENDING' | 'CONFIRMED'
export type PayStatus = 'UNPAID' | 'PAID'

export interface TournamentEvent {
  id: string
  name: string
  sport: string
  location: string
  startDate: string
  startTime: string
  endDate: string
  template: string
  registrationsOpen: boolean
}

export interface Category { id: string; eventId: string; name: string; maxTeams: number }

export type CompetitionFormat = 'ROUND_ROBIN' | 'GROUPS_KNOCKOUT'
export type Legs = 'SINGLE' | 'HOME_AWAY'
export type FinalsType = 'PLACEMENT' | 'SINGLE_GROUP_CROSSOVER' | 'SPLIT_GROUP_FINALS'

export interface CompetitionConfig {
  format: CompetitionFormat
  legs: Legs
  groupsCount: number
  qualifiersPerGroup: number
  finalsType: FinalsType
}

export interface Competition extends CompetitionConfig {
  id: string
  eventId: string
  categoryId: string
}

export type ScheduleStatus = 'NONE' | 'GENERATED' | 'APPROVED' | 'PUBLISHED'

export interface ScheduleConfig {
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
  dailyStart: string
  slotsPerDay: number
}

export interface Schedule {
  eventId: string
  status: ScheduleStatus
  config: ScheduleConfig
}

export interface ScheduledMatch {
  id: string
  eventId: string
  categoryId: string
  groupLabel: string
  day: string
  time: string
  field: string
  home: string
  away: string
}

export interface FixtureCategory {
  id: string
  name: string
  format: CompetitionFormat
  groupsCount: number
  legs: Legs
  teams: string[]
}

export interface Registration {
  id: string
  eventId: string
  categoryId: string
  teamName: string
  contactName: string
  contactPhone: string
  contactEmail: string
  status: RegStatus
  paymentStatus: PayStatus
  createdAt: string
}

export interface State {
  events: TournamentEvent[]
  categories: Category[]
  registrations: Registration[]
  competitions: Competition[]
  schedules: Schedule[]
  scheduledMatches: ScheduledMatch[]
}
