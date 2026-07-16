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
}
