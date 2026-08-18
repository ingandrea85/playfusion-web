// o3 (services/o3-sport-events/src/read-model.ts + domain.ts)
export type Playbook = 'PB-1' | 'PB-2'
export type TieBreakCriterion = 'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR'
export interface EventDetail {
  sportEventId: string
  sport: string
  categorie: string[]
  dates: { from: string; to: string }
  status: 'Published'
  playbook: Playbook
  name?: string
  location?: string
  startTime?: string
  tieBreak?: TieBreakCriterion[]
}
export type EventSummary = EventDetail
export interface CreateEventInput {
  sport: string
  categorie: string[]
  dates: { from: string; to: string }
  name?: string
  location?: string
  startTime?: string
  tieBreak?: TieBreakCriterion[]
  playbook?: Playbook
}
export interface CreateEventResult { sportEventId: string; status: 'Published' }

// o5 (services/o5-registration/src/domain/registration.ts + application/*)
export type RegistrationStatus = 'Applied' | 'Confirmed' | 'Rejected'
export interface RegistrationView {
  registrationId: string
  participantRef: string
  sportEventId: string
  categoria: string
  status: RegistrationStatus
}
export interface ApplyRegistrationInput { participantRef: string; sportEventId: string; categoria: string }
export interface CategoryCapacity { categoria: string; cap: number; count: number; remaining: number }
export interface RegistrationWindowView { sportEventId: string; state: 'Open' | 'Closed'; categories: CategoryCapacity[] }

// o2 (services/o2-identity-access/src/handler.ts)
export interface MagicLinkInput { contact: string; roles?: string[]; purpose?: string; ttlSeconds?: number }
export interface MagicLinkResult { subject: string; token: string }
export interface VerifyResult { subject: string; roles: string[]; organizationId?: string }

// o4 (services/o4-participant-management/src/handler.ts) — thin completeness stub for S3;
// the handler's zod body is exactly `{ type: 'squadra' | 'atleta', categoria: string }`,
// no `name` field, so the DTO mirrors that verbatim rather than the brief's placeholder shape.
export interface CreateParticipantInput { type: 'squadra' | 'atleta'; categoria: string }

// o12 fee read (S4)
export type FeeStatus = 'Requested' | 'Paid'
export interface FeeView { registrationId: string; status: FeeStatus }
