import type { Category, Competition, CompetitionConfig, Registration, Schedule, ScheduleConfig, ScheduledMatch, StandingRow, FinalMatch, GroupSlot, FixtureCategory, State, TournamentEvent, ScheduledCategory, Organization, OrgStatus, Subscription, PlanKey, SubStatus, TieBreakCriterion, TieOverride, Announcement } from './types'
import { buildSeed } from './seed'
import { buildFixtures, splitIntoGroups, addMinutes } from './fixtures'
import { buildFinals } from './finals'
import { defaultTieBreak } from './tiebreak'
import { recomputeStandings, resolveFinals, decideMatch } from './derive'
import { eventPhase, pendingActions, nextMatches, lastResults, groupLeaders } from './overview'
import type { EventPhase } from './types'

const KEY = 'playfusion-mock-v1'

function load(): State {
  const raw = localStorage.getItem(KEY)
  if (!raw) { const seed = buildSeed(); localStorage.setItem(KEY, JSON.stringify(seed)); return seed }
  // Merge over a fresh seed so a stale cache from an older version (missing newer
  // top-level collections) defaults those keys instead of crashing on undefined.
  return { ...buildSeed(), ...(JSON.parse(raw) as Partial<State>) } as State
}
function save(state: State): void { localStorage.setItem(KEY, JSON.stringify(state)) }

export function resetDemo(): void { save(buildSeed()) }

export function getEvents(): TournamentEvent[] { return load().events }
export function getEvent(id: string): TournamentEvent | undefined { return load().events.find(e => e.id === id) }

export function createEvent(input: { name: string; sport: string; location: string; startDate: string; startTime: string; endDate: string; tieBreak?: TieBreakCriterion[]; playbook?: 'PB-1' | 'PB-2' }): TournamentEvent {
  const state = load()
  const nextNum = Math.max(1, ...state.events.map(e => Number(e.id.replace('evt-', '')) || 0)) + 1
  const event: TournamentEvent = {
    id: `evt-${nextNum}`, organizationId: 'org-1', name: input.name, sport: input.sport, location: input.location,
    startDate: input.startDate, startTime: input.startTime, endDate: input.endDate, template: 'PB-1', registrationsOpen: false,
    tieBreak: input.tieBreak ?? defaultTieBreak(input.sport),
    playbook: input.playbook ?? 'PB-1',
  }
  state.events.push(event); save(state); return event
}

export function getCategories(eventId: string): Category[] {
  return load().categories.filter(c => c.eventId === eventId)
}
export function addCategory(eventId: string, name: string, maxTeams: number): Category {
  const state = load()
  const category: Category = { id: `cat-${state.categories.length + 1}`, eventId, name, maxTeams }
  state.categories.push(category); save(state); return category
}

export function setRegistrationsOpen(eventId: string, open: boolean): void {
  const state = load()
  const e = state.events.find(x => x.id === eventId); if (e) e.registrationsOpen = open
  if (open && e && e.playbook !== 'PB-2') upsertSystemAnnouncement(state, { eventId, categoryId: null, title: 'Iscrizioni aperte', body: 'Le iscrizioni al torneo sono aperte.', dedupeKey: 'registrations-open' })
  save(state)
}

export function getRegistrations(eventId: string): Registration[] {
  return load().registrations.filter(r => r.eventId === eventId)
}
// Max-based id (not length-based) so a remove-then-add sequence never reuses a live id.
function nextRegId(state: State): string {
  return `reg-${Math.max(0, ...state.registrations.map(r => Number(r.id.replace('reg-', '')) || 0)) + 1}`
}
export function addRegistration(input: {
  eventId: string; categoryId: string; teamName: string; contactName: string; contactPhone: string; contactEmail: string
}): Registration {
  const state = load()
  const reg: Registration = {
    id: nextRegId(state), ...input,
    status: 'PENDING', paymentStatus: 'UNPAID', createdAt: new Date().toISOString(),
  }
  state.registrations.push(reg); save(state); return reg
}
export function addTeam(eventId: string, categoryId: string, teamName: string, contacts?: { contactName?: string; contactPhone?: string; contactEmail?: string }): Registration {
  const state = load()
  const reg: Registration = {
    id: nextRegId(state), eventId, categoryId, teamName,
    contactName: contacts?.contactName ?? '', contactPhone: contacts?.contactPhone ?? '', contactEmail: contacts?.contactEmail ?? '',
    status: 'CONFIRMED', paymentStatus: 'UNPAID', createdAt: new Date().toISOString(),
  }
  state.registrations.push(reg); save(state); return reg
}
export function updateTeam(regId: string, patch: { teamName?: string; categoryId?: string; contactName?: string; contactPhone?: string; contactEmail?: string }): void {
  const state = load()
  const r = state.registrations.find(x => x.id === regId); if (r) Object.assign(r, patch)
  save(state)
}
export function removeTeam(regId: string): void {
  const state = load()
  const r = state.registrations.find(x => x.id === regId)
  if (!r) { save(state); return }
  state.registrations = state.registrations.filter(x => x.id !== regId)
  state.groupSlots = state.groupSlots.filter(s => !(s.eventId === r.eventId && s.categoryId === r.categoryId && s.team === r.teamName))
  save(state)
}
export function confirmTeam(regId: string): void {
  const state = load()
  const r = state.registrations.find(x => x.id === regId); if (r) r.status = 'CONFIRMED'
  save(state)
}
export function markPaid(regId: string): void {
  const state = load()
  const r = state.registrations.find(x => x.id === regId); if (r) r.paymentStatus = 'PAID'
  save(state)
}

export function getCompetitions(eventId: string): Competition[] {
  return load().competitions.filter(c => c.eventId === eventId)
}
export function getCompetition(categoryId: string): Competition | undefined {
  return load().competitions.find(c => c.categoryId === categoryId)
}
export function upsertCompetition(input: { eventId: string; categoryId: string } & CompetitionConfig): Competition {
  const state = load()
  const existing = state.competitions.find(c => c.categoryId === input.categoryId)
  if (existing) { Object.assign(existing, input); save(state); return existing }
  const comp: Competition = { id: `comp-${state.competitions.length + 1}`, groupsLocked: false, ...input }
  state.competitions.push(comp); save(state); return comp
}
export function applyToAllCategories(eventId: string, config: CompetitionConfig): void {
  const state = load()
  for (const cat of state.categories.filter(c => c.eventId === eventId)) {
    const existing = state.competitions.find(c => c.categoryId === cat.id)
    if (existing) Object.assign(existing, config)
    else state.competitions.push({ id: `comp-${state.competitions.length + 1}`, eventId, categoryId: cat.id, groupsLocked: false, ...config })
  }
  save(state)
}

export function getSchedule(eventId: string): Schedule | undefined {
  return load().schedules.find(s => s.eventId === eventId)
}
export function getScheduledMatches(eventId: string): ScheduledMatch[] {
  return load().scheduledMatches.filter(m => m.eventId === eventId)
}
function ensureSchedule(state: State, eventId: string): Schedule {
  let s = state.schedules.find(x => x.eventId === eventId)
  if (!s) {
    s = { eventId, status: 'NONE', config: { dailyStart: '09:00', slotsPerDay: 8, finalsDate: '', byCategory: {} } }
    state.schedules.push(s)
  }
  return s
}
function resolveGroups(state: State, eventId: string, cat: FixtureCategory): Array<{ groupLabel: string; teams: string[] }> {
  const slots = state.groupSlots.filter(s => s.eventId === eventId && s.categoryId === cat.id)
  if (slots.length) {
    const labels = [...new Set(slots.map(s => s.groupLabel))].sort()
    return labels.map(lb => ({ groupLabel: lb, teams: slots.filter(s => s.groupLabel === lb).map(s => s.team) }))
  }
  return splitIntoGroups(cat)
}
export function generateSchedule(eventId: string, config: ScheduleConfig): void {
  const state = load()
  const sched = ensureSchedule(state, eventId)
  if (sched.status === 'APPROVED' || sched.status === 'PUBLISHED') { save(state); return }
  const event = state.events.find(e => e.id === eventId)
  if (!event) { save(state); return }
  sched.config = config
  const DEF = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 }
  const cats: FixtureCategory[] = state.categories.filter(c => c.eventId === eventId).map(c => {
    const comp = state.competitions.find(k => k.categoryId === c.id)
    const teams = state.registrations
      .filter(r => r.eventId === eventId && r.categoryId === c.id && r.status === 'CONFIRMED')
      .map(r => r.teamName)
    const cs = config.byCategory[c.id] ?? DEF
    return {
      id: c.id, name: c.name, format: comp?.format ?? 'ROUND_ROBIN', groupsCount: comp?.groupsCount ?? 1, legs: comp?.legs ?? 'SINGLE', teams,
      fields: cs.fields, periods: cs.periods, periodMinutes: cs.periodMinutes, breakMinutes: cs.breakMinutes,
    }
  })
  const resolved = cats.map(cat => ({ cat, groups: resolveGroups(state, eventId, cat) }))
  const schedCats: ScheduledCategory[] = resolved.map(({ cat, groups }) => ({
    id: cat.id, legs: cat.legs, fields: cat.fields, periods: cat.periods, periodMinutes: cat.periodMinutes, breakMinutes: cat.breakMinutes, groups,
  }))
  const matches = buildFixtures(eventId, event.startDate, event.endDate, config.dailyStart, config.slotsPerDay, schedCats)
  state.scheduledMatches = state.scheduledMatches.filter(m => m.eventId !== eventId).concat(matches)

  state.standings = state.standings.filter(s => s.eventId !== eventId)
  for (const { cat, groups } of resolved) for (const g of groups) for (const team of g.teams) {
    state.standings.push({ eventId, categoryId: cat.id, groupLabel: g.groupLabel, team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 })
  }

  const finalsOut: FinalMatch[] = []
  let fseq = 0
  for (const { cat, groups } of resolved) {
    const comp = state.competitions.find(k => k.categoryId === cat.id)
    if (!comp) continue
    const draws = buildFinals(groups.map(g => g.groupLabel), comp.qualifiersPerGroup, comp.finalsType, comp.thirdPlace ?? false)
    if (!draws.length) continue
    const fields = cat.fields.length ? cat.fields : ['Campo 1']
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes
    let fi = 0, si = 0
    for (const d of draws) {
      finalsOut.push({ id: `fm-${++fseq}`, eventId, categoryId: cat.id, bracketLabel: d.bracketLabel, round: d.round, order: d.order, home: d.home, away: d.away, day: config.finalsDate, time: addMinutes(config.dailyStart, si * slotMinutes), field: fields[fi], homeResolved: null, awayResolved: null, homeScore: null, awayScore: null, homeShootout: null, awayShootout: null })
      fi++; if (fi >= fields.length) { fi = 0; si++ }
    }
  }
  state.finals = state.finals.filter(f => f.eventId !== eventId).concat(finalsOut)
  sched.status = 'GENERATED'
  resolveFinals(state, eventId)
  save(state)
}
export function approveSchedule(eventId: string): void {
  const state = load()
  const s = state.schedules.find(x => x.eventId === eventId)
  if (s && s.status === 'GENERATED') s.status = 'APPROVED'
  save(state)
}
export function publishSchedule(eventId: string): void {
  const state = load()
  const s = state.schedules.find(x => x.eventId === eventId)
  if (s && s.status === 'APPROVED') {
    s.status = 'PUBLISHED'
    upsertSystemAnnouncement(state, { eventId, categoryId: null, title: 'Calendario pubblicato', body: 'Il calendario delle gare è online.', dedupeKey: 'schedule-published' })
  }
  save(state)
}
export function getStandings(eventId: string): StandingRow[] {
  return load().standings.filter(s => s.eventId === eventId)
}
export function getFinals(eventId: string): FinalMatch[] {
  return load().finals.filter(f => f.eventId === eventId)
}
export function getGroupSlots(eventId: string): GroupSlot[] {
  return load().groupSlots.filter(s => s.eventId === eventId)
}
export function getTieOverrides(eventId: string): TieOverride[] {
  return load().tieOverrides.filter(o => o.eventId === eventId)
}
export function setTieOverride(eventId: string, categoryId: string, groupLabel: string, order: string[]): void {
  const state = load()
  const existing = state.tieOverrides.find(o => o.eventId === eventId && o.categoryId === categoryId && o.groupLabel === groupLabel)
  if (existing) existing.order = order
  else state.tieOverrides.push({ eventId, categoryId, groupLabel, order })
  resolveFinals(state, eventId)
  save(state)
}
export function drawGroups(eventId: string, categoryId: string): void {
  const state = load()
  const comp = state.competitions.find(k => k.categoryId === categoryId)
  if (!comp || comp.groupsLocked) { save(state); return }
  const teams = state.registrations.filter(r => r.eventId === eventId && r.categoryId === categoryId && r.status === 'CONFIRMED').map(r => r.teamName)
  const groups = splitIntoGroups({ format: comp.format, groupsCount: comp.groupsCount, teams })
  state.groupSlots = state.groupSlots.filter(s => !(s.eventId === eventId && s.categoryId === categoryId))
  for (const g of groups) for (const team of g.teams) state.groupSlots.push({ eventId, categoryId, team, groupLabel: g.groupLabel })
  save(state)
}
export function moveTeam(eventId: string, categoryId: string, team: string, toGroupLabel: string): void {
  const state = load()
  const comp = state.competitions.find(k => k.categoryId === categoryId)
  if (comp?.groupsLocked) { save(state); return }
  const s = state.groupSlots.find(x => x.eventId === eventId && x.categoryId === categoryId && x.team === team)
  if (s) s.groupLabel = toGroupLabel
  save(state)
}
export function setGroupsLocked(categoryId: string, locked: boolean): void {
  const state = load()
  const comp = state.competitions.find(k => k.categoryId === categoryId)
  if (comp) comp.groupsLocked = locked
  save(state)
}
export function rescheduleMatch(matchId: string, patch: { day: string; time: string; field: string }): void {
  const state = load()
  const m = state.scheduledMatches.find(x => x.id === matchId)
  if (m) {
    m.day = patch.day; m.time = patch.time; m.field = patch.field
    upsertSystemAnnouncement(state, { eventId: m.eventId, categoryId: m.categoryId, title: 'Gara riprogrammata', body: `${m.home} vs ${m.away}: ${m.day} ${m.time} · ${m.field}`, dedupeKey: `reschedule:${m.id}` })
  }
  save(state)
}

export function getOrganizations(): Organization[] { return load().organizations }
export function getOrganization(id: string): Organization | undefined { return load().organizations.find(o => o.id === id) }
export function setOrgStatus(id: string, status: OrgStatus): void {
  const state = load()
  const o = state.organizations.find(x => x.id === id); if (o) o.status = status
  save(state)
}
export function setOrgModule(id: string, moduleKey: string, active: boolean): void {
  const state = load()
  const o = state.organizations.find(x => x.id === id)
  if (!o || moduleKey === 'M-Core') { save(state); return }
  if (active) { if (!o.modules.includes(moduleKey)) o.modules.push(moduleKey) }
  else o.modules = o.modules.filter(m => m !== moduleKey)
  save(state)
}

export function getSubscription(orgId: string): Subscription | undefined {
  return load().subscriptions.find(s => s.organizationId === orgId)
}
export function setSubscriptionPlan(orgId: string, plan: PlanKey): void {
  const state = load()
  const s = state.subscriptions.find(x => x.organizationId === orgId); if (s) s.plan = plan
  save(state)
}
export function setSubscriptionStatus(orgId: string, status: SubStatus): void {
  const state = load()
  const s = state.subscriptions.find(x => x.organizationId === orgId); if (s) s.status = status
  save(state)
}

export function recordResult(matchId: string, homeScore: number, awayScore: number): void {
  const state = load()
  const m = state.scheduledMatches.find(x => x.id === matchId)
  if (!m) { save(state); return }
  m.homeScore = homeScore; m.awayScore = awayScore
  recomputeStandings(state, m.eventId)
  resolveFinals(state, m.eventId)
  save(state)
}

export function recordFinalResult(finalMatchId: string, homeScore: number, awayScore: number, shootout?: { home: number; away: number }): void {
  const state = load()
  const f = state.finals.find(x => x.id === finalMatchId)
  if (!f) { save(state); return }
  f.homeScore = homeScore; f.awayScore = awayScore
  if (shootout && homeScore === awayScore) { f.homeShootout = shootout.home; f.awayShootout = shootout.away }
  else { f.homeShootout = null; f.awayShootout = null }
  resolveFinals(state, f.eventId)
  for (const fin of state.finals.filter(x => x.eventId === f.eventId && x.round === 'Finale')) {
    const key = `champion:${fin.categoryId}:${fin.bracketLabel}`
    const d = decideMatch(fin)
    if (d) upsertSystemAnnouncement(state, { eventId: f.eventId, categoryId: fin.categoryId, title: 'Campione', body: `${d.winner} ha vinto ${fin.bracketLabel}.`, dedupeKey: key })
    else removeSystemAnnouncement(state, f.eventId, key)
  }
  save(state)
}

export function getAnnouncements(eventId: string): Announcement[] {
  return load().announcements
    .filter(a => a.eventId === eventId)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
}
// Max-based id so a remove-then-add sequence never reuses a live id.
function nextAnnId(state: State): string {
  return `ann-${Math.max(0, ...state.announcements.map(a => Number(a.id.replace('ann-', '')) || 0)) + 1}`
}
export function addAnnouncement(input: { eventId: string; categoryId: string | null; title: string; body: string; pinned: boolean }): Announcement {
  const state = load()
  const ann: Announcement = { id: nextAnnId(state), ...input, source: 'ORGANIZER', createdAt: new Date().toISOString() }
  state.announcements.push(ann); save(state); return ann
}
export function removeAnnouncement(id: string): void {
  const state = load()
  state.announcements = state.announcements.filter(a => a.id !== id)
  save(state)
}
export function togglePin(id: string): void {
  const state = load()
  const a = state.announcements.find(x => x.id === id); if (a) a.pinned = !a.pinned
  save(state)
}
export function announcementReach(eventId: string, categoryId: string | null): number {
  return load().registrations.filter(r =>
    r.eventId === eventId && r.status === 'CONFIRMED' && (categoryId === null || r.categoryId === categoryId),
  ).length
}
// System (auto) announcements: unique per eventId+dedupeKey; upsert replaces text in place.
function upsertSystemAnnouncement(state: State, input: { eventId: string; categoryId: string | null; title: string; body: string; dedupeKey: string }): void {
  const existing = state.announcements.find(a => a.eventId === input.eventId && a.dedupeKey === input.dedupeKey)
  if (existing) { existing.title = input.title; existing.body = input.body; existing.categoryId = input.categoryId; existing.createdAt = new Date().toISOString(); return }
  state.announcements.push({ id: nextAnnId(state), source: 'SYSTEM', pinned: false, createdAt: new Date().toISOString(), ...input })
}
function removeSystemAnnouncement(state: State, eventId: string, dedupeKey: string): void {
  state.announcements = state.announcements.filter(a => !(a.eventId === eventId && a.dedupeKey === dedupeKey))
}

export function getEventPhase(eventId: string): EventPhase { return eventPhase(load(), eventId) }
export function getPendingActions(eventId: string) { return pendingActions(load(), eventId) }
export function getNextMatches(eventId: string, n: number) { return nextMatches(load(), eventId, n) }
export function getLastResults(eventId: string, n: number) { return lastResults(load(), eventId, n) }
export function getGroupLeaders(eventId: string) { return groupLeaders(load(), eventId) }
