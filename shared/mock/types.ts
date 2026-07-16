export type RegStatus = 'PENDING' | 'CONFIRMED'
export type PayStatus = 'UNPAID' | 'PAID'

export interface TournamentEvent {
  id: string
  name: string
  sport: string
  startDate: string
  endDate: string
  template: string
  registrationsOpen: boolean
}

export interface Category { id: string; eventId: string; name: string; maxTeams: number }

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
}
