export type RegStatus = 'PENDING' | 'CONFIRMED'
export type PayStatus = 'UNPAID' | 'PAID'

export type TieBreakCriterion = 'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR'

export type EventPhase = 'PREP' | 'LIVE' | 'DONE'

export interface TournamentEvent {
  id: string
  organizationId: string
  name: string
  sport: string
  location: string
  startDate: string
  startTime: string
  endDate: string
  template: string
  registrationsOpen: boolean
  tieBreak: TieBreakCriterion[]
  playbook: 'PB-1' | 'PB-2'
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
  thirdPlace?: boolean
}

export interface Competition extends CompetitionConfig {
  id: string
  eventId: string
  categoryId: string
  groupsLocked: boolean
}

export type ScheduleStatus = 'NONE' | 'GENERATED' | 'APPROVED' | 'PUBLISHED'

export interface CategorySchedule {
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
}

export interface ScheduleConfig {
  dailyStart: string
  slotsPerDay: number
  finalsDate: string
  byCategory: Record<string, CategorySchedule>
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
  homeScore: number | null
  awayScore: number | null
}

export interface StandingRow {
  eventId: string
  categoryId: string
  groupLabel: string
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export interface FinalDraw {
  bracketLabel: string
  round: string
  order: number
  home: string
  away: string
}

export interface FinalMatch extends FinalDraw {
  id: string
  eventId: string
  categoryId: string
  day: string
  time: string
  field: string
  homeResolved: string | null
  awayResolved: string | null
  homeScore: number | null
  awayScore: number | null
  homeShootout: number | null
  awayShootout: number | null
}

export interface FixtureCategory {
  id: string
  name: string
  format: CompetitionFormat
  groupsCount: number
  legs: Legs
  teams: string[]
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
}

export interface GroupSlot {
  eventId: string
  categoryId: string
  team: string
  groupLabel: string
}

export interface TieOverride {
  eventId: string
  categoryId: string
  groupLabel: string
  order: string[]
}

export interface ScheduledCategory {
  id: string
  legs: Legs
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
  groups: Array<{ groupLabel: string; teams: string[] }>
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

export type OrgStatus = 'ACTIVE' | 'SUSPENDED'
export interface Organization {
  id: string
  name: string
  status: OrgStatus
  modules: string[]
}

export type PlanKey = 'FREE' | 'PRO' | 'BUSINESS'
export type SubStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE'
export interface Subscription {
  organizationId: string
  plan: PlanKey
  status: SubStatus
  renewsOn: string
}

export interface Announcement {
  id: string
  eventId: string
  categoryId: string | null   // null = tutto l'evento
  title: string
  body: string
  pinned: boolean
  source: 'ORGANIZER' | 'SYSTEM'
  dedupeKey?: string
  createdAt: string
}

export interface State {
  events: TournamentEvent[]
  categories: Category[]
  registrations: Registration[]
  competitions: Competition[]
  schedules: Schedule[]
  scheduledMatches: ScheduledMatch[]
  standings: StandingRow[]
  finals: FinalMatch[]
  groupSlots: GroupSlot[]
  tieOverrides: TieOverride[]
  organizations: Organization[]
  subscriptions: Subscription[]
  announcements: Announcement[]
}
