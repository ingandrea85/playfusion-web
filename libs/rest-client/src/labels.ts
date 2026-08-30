import type { EventDetail } from './types.js'

/** Epic #143 (S5): user-facing nouns derived from an event's sport-profile snapshot, so the same
 *  screens read "Squadre"/"Reti" for team-football and "Giocatori"/"Set" (etc.) for individual sports.
 *  Legacy events (no snapshot) fall back to the team-football wording — no regression. */
export interface EventLabels {
  /** Singular competitor noun — "Squadra" (team) / "Giocatore" (individual). */
  participant: string
  /** Plural competitor noun — "Squadre" / "Giocatori". */
  participantPlural: string
  /** The sport's score noun — "Reti" (default) / the profile's `scoreLabel`. */
  score: string
}

export function eventLabels(e: Pick<EventDetail, 'participantType' | 'sportProfile'>): EventLabels {
  const individual = e.participantType === 'individual'
  return {
    participant: individual ? 'Giocatore' : 'Squadra',
    participantPlural: individual ? 'Giocatori' : 'Squadre',
    score: e.sportProfile?.scoreLabel || 'Reti',
  }
}
