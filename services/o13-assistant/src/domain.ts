export type EventFormat = 'groups' | 'groups+bracket' | 'bracket' | 'festival'

export interface EventDraftCore {
  name: string
  sportId: string
  participantType: 'team' | 'individual'
  format: EventFormat
  categorie: string[]
  dates: { from: string; to: string }
  startTime?: string
  location?: string
  playbook: 'PB-1' | 'PB-2'
}

export interface DraftGroup { label: string; teamCount: number; field?: string }

/** The subset of o7 ScheduleConfig the assistant fills. Mirrors rest-client ScheduleConfig. */
export interface ScheduleConfigDraft {
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
  dailyStart: string        // HH:mm
  groupsCount: number
  legs: 'SINGLE' | 'HOME_AWAY'
  finalsEnabled?: boolean
  finalsType?: string
  festivalUsePools?: boolean
  finalissimaField?: string
}

export interface EventDraft {
  event: EventDraftCore
  groupsByCategory?: Record<string, { groups: DraftGroup[] }>
  schedule: ScheduleConfigDraft
  rationale: string
  assumptions: string[]
}

export interface OpenQuestion { field: string; question: string }

/** The model returns EITHER a draft OR completion questions. */
export interface DraftResponse { draft?: EventDraft; openQuestions?: OpenQuestion[] }

export interface DraftInput {
  description: string
  answers?: Record<string, string>
  sportId?: string
}
