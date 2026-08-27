// o3 (services/o3-sport-events/src/read-model.ts + domain.ts)
export type Playbook = 'PB-1' | 'PB-2'
export type TieBreakCriterion = 'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR'
// S12: finals bracket shape (O6).
export type FinalsType = 'SINGLE_GROUP_CROSSOVER' | 'SPLIT_GROUP_FINALS' | 'PLACEMENT'
export interface EventDetail {
  sportEventId: string
  // S18: the read model always populates this (the public portal resolves the tenant brand from
  // it); optional on the DTO so the many existing event fixtures/consumers need no org id.
  organizationId?: string
  sport: string
  categorie: string[]
  dates: { from: string; to: string }
  status: 'Published'
  playbook: Playbook
  name?: string
  location?: string
  startTime?: string
  tieBreak?: TieBreakCriterion[]
  // Finals format is per-category on the ScheduleConfig (Calendario tab), not on the event.
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
// o6 gironi (composition on the o3 event) — S8
export interface Group { label: string; teams: string[] }
export interface CategoryGironi { groups: Group[]; locked: boolean }
export type GironiMap = Record<string, CategoryGironi>

// o5 (services/o5-registration/src/domain/registration.ts + application/*)
export type RegistrationStatus = 'Applied' | 'Confirmed' | 'Rejected'
export interface RegistrationView {
  registrationId: string
  participantRef: string
  sportEventId: string
  categoria: string
  status: RegistrationStatus
  /** S14 (PB-2 direct roster): the real team name, when the organizer entered one. */
  teamName?: string
}
export interface ApplyRegistrationInput { participantRef: string; sportEventId: string; categoria: string }
export interface AddTeamInput { categoria: string; teamName: string }
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

// o7 scheduling (services/o7-scheduling/src/domain.ts) — S7
export type ScheduleStatus = 'NONE' | 'GENERATED' | 'APPROVED' | 'PUBLISHED'
export type Legs = 'SINGLE' | 'HOME_AWAY'
// S22: per-category playing config override (fields + match params + legs).
export interface CategorySchedule {
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
  legs: Legs
  // Finals format per category (moved off the event): finalsType absent (or finalsEnabled === false)
  // ⇒ no bracket; finalsTeamsToBracket sizes the SPLIT_GROUP_FINALS bracket.
  finalsType?: FinalsType
  finalsEnabled?: boolean
  finalsTeamsToBracket?: number
  finalsFormatId?: string
}
export interface ScheduleConfig {
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
  dailyStart: string // 'HH:mm'
  groupsCount: number
  legs: Legs
  byCategory?: Record<string, CategorySchedule>
  finalsDate?: string // day the finals bracket is played on (global; defaults to the event's last day)
  // top-level default finals format (the "same play-config for all categories" mode)
  finalsType?: FinalsType
  finalsEnabled?: boolean
  finalsTeamsToBracket?: number
  finalsFormatId?: string
}
export interface ScheduleView {
  sportEventId: string
  organizationId: string
  status: ScheduleStatus
  config: ScheduleConfig
}
// S26: match lifecycle. Absent status on legacy fixtures = treated as SCHEDULED.
export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELLED'
export interface ScheduledMatchView {
  id: string
  sportEventId: string
  categoryId: string
  groupLabel: string
  day: string  // 'YYYY-MM-DD'
  time: string // 'HH:mm'
  field: string
  home: string
  away: string
  homeScore?: number | null // S10: null/undefined = not played
  awayScore?: number | null
  status?: MatchStatus // S26
  startedAt?: string | null // S26: ISO kickoff instant
  // S12/S13: finals. phase absent ⇒ GROUP. FINAL/FINAL_GROUP carry bracket metadata + placeholder
  // home/away, with homeResolved/awayResolved filled on read (qualifier + winner propagation).
  phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP'
  bracketLabel?: string
  round?: string
  order?: number
  slot?: string
  placementFrom?: number
  placementTo?: number
  decidedWinner?: 'HOME' | 'AWAY' // organizer/director decree on a drawn knockout match
  homeResolved?: string
  awayResolved?: string
}
// S10 standings
export interface StandingRow {
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
}
// S13 final ranking (podium/placements) per category — progressive; pending where undecided.
export interface FinalStandingRow { position: number; team?: string; pending?: 'result' | 'tie' }
export interface CategoryFinalStanding { categoryId: string; rows: FinalStandingRow[] }

// SP1 — custom finals formats (admin-authored global catalog). A match references qualifiers by
// cross-group seed, or by winner/loser of an earlier slot.
export type FinalsMatchRef = { seed: number } | { winnerOf: string } | { loserOf: string }
export interface FinalsFormatMatch { slot: string; home: FinalsMatchRef; away: FinalsMatchRef; placementFrom?: number; placementTo?: number }
export interface FinalsFormatRound { name: string; matches: FinalsFormatMatch[] }
export interface CustomFinalsFormat { id: string; name: string; seeds: number; rounds: FinalsFormatRound[]; createdAt: string }
export interface FinalsFormatInput { name: string; seeds: number; rounds: FinalsFormatRound[] }

// S17 — event resources & post-match logistics.
export interface Resource { resourceId: string; name: string; icon?: string; occupancyMinutes: number; capacityPersons: number; offsetMinutes: number }
export interface ResourceAssignment { resourceId: string; day: string; team: string; slotTime: string }
export interface ResourceConfig { resources: Resource[]; defaultTeamSize?: number; teamSizes?: Record<string, number>; assignments?: ResourceAssignment[] }
export interface TurnTeam { team: string; categoryId: string; size: number; pinned?: boolean }
export interface ResourceSlot { time: string; teams: TurnTeam[]; persons: number; capacity: number; overflow: boolean }
export interface ResourceDayTurns { resourceId: string; day: string; slots: ResourceSlot[] }
export interface UnassignableTeam { day: string; team: string; categoryId: string; size: number }
export interface ResourcePlan {
  days: string[]
  defaultTeamSize: number
  teams: { team: string; categoryId: string; size: number }[]
  turns: ResourceDayTurns[]
  unassignable: UnassignableTeam[]
  finishesByDay: Record<string, { team: string; categoryId: string; finish: string }[]>
}
export interface GroupStanding {
  categoryId: string
  groupLabel: string
  rows: StandingRow[]
  // S11: sets of teams still perfectly tied after the policy (mutual order in `rows` is
  // name-based, non-sporting); empty/absent when fully resolved.
  unresolved?: string[][]
  // S11: audit of the manual override applied to this group, if one currently resolves a tie.
  override?: { order: string[]; resolvedBy: string; resolvedAt: string }
}

// S15 (O9 communications) — organizer announcements. categoryId null = whole event.
export type AnnouncementSource = 'ORGANIZER'
export interface AnnouncementView {
  announcementId: string
  sportEventId: string
  categoryId: string | null
  title: string
  body: string
  pinned: boolean
  source: AnnouncementSource
  createdAt: string
}
export interface PublishAnnouncementInput { categoryId: string | null; title: string; body: string; pinned?: boolean }

// S18 (O1 organization) — per-tenant brand identity. A null brand from the API = default theme.
export interface Brand { logoText: string; primaryColor: string; accentColor: string }

// S20 (O11) — per-tenant subscription (trial-first billing). trialDaysLeft is server-computed.
export type PlanKey = 'FREE' | 'PRO' | 'BUSINESS'
export type SubStatus = 'TRIAL' | 'ACTIVE'
export interface Subscription { organizationId: string; plan: PlanKey; status: SubStatus; renewsOn: string; trialDaysLeft: number }

// S19 (O2) — per-tenant membership & roles.
export type OrgRole = 'OWNER' | 'ORGANIZER' | 'DIRECTOR'
export interface Member { memberId: string; organizationId: string; name: string; email: string; role: OrgRole; createdAt: string }
export interface Invitation { invitationId: string; organizationId: string; name: string; email: string; role: OrgRole; status: 'PENDING' | 'ACCEPTED'; createdAt: string }
export interface InviteMemberInput { name: string; email: string; role: OrgRole }
