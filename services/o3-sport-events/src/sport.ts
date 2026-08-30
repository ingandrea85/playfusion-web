import { DomainError } from '@playfusion/platform-lib';

// Sport profiles — a GLOBAL catalog managed by the platform admin (Epic #143). A sport is a
// competition *identity*: which participant kinds it allows, the score label, the points policy and
// the tie-break order. Structure (gironi/tabellone) and team-vs-individual (when 'both') are event
// choices, NOT part of the sport.
export type SportParticipants = 'team' | 'individual' | 'both';
// Generic, sport-agnostic tie-break criteria (points are always the primary sort).
export type SportTieBreak = 'HEAD_TO_HEAD' | 'SCORE_DIFFERENCE' | 'SCORE_FOR' | 'WINS';
export const SPORT_TIE_BREAKS: SportTieBreak[] = ['HEAD_TO_HEAD', 'SCORE_DIFFERENCE', 'SCORE_FOR', 'WINS'];

export interface SportPoints { win: number; draw: number | null; loss: number }
export interface SportProfile {
  id: string;
  name: string;
  participants: SportParticipants;
  scoreLabel: string;        // "Reti" | "Set" | "Punti" …
  points: SportPoints;       // draw === null → the sport has no draws
  tieBreak: SportTieBreak[];
  createdAt: string;
}

export interface SportProfileInput {
  name: string;
  participants: SportParticipants;
  scoreLabel: string;
  points: SportPoints;
  tieBreak: SportTieBreak[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validate + normalise a sport-profile submission (trims labels, checks the points/tie-break shape). */
export function makeSportProfile(input: SportProfileInput & { id: string; createdAt: string }): SportProfile {
  const name = (input.name ?? '').trim();
  const scoreLabel = (input.scoreLabel ?? '').trim();
  if (!name) throw new DomainError('INVALID_SPORT', 'name is required', 422);
  if (!scoreLabel) throw new DomainError('INVALID_SPORT', 'scoreLabel is required', 422);
  if (!['team', 'individual', 'both'].includes(input.participants)) throw new DomainError('INVALID_SPORT', 'participants must be team/individual/both', 422);
  const p = input.points;
  if (!p || !isNum(p.win) || !isNum(p.loss) || !(p.draw === null || isNum(p.draw))) {
    throw new DomainError('INVALID_SPORT', 'points must be { win:number, draw:number|null, loss:number }', 422);
  }
  const tb = Array.isArray(input.tieBreak) ? input.tieBreak : [];
  if (tb.some((t) => !SPORT_TIE_BREAKS.includes(t))) throw new DomainError('INVALID_SPORT', `tieBreak must be from ${SPORT_TIE_BREAKS.join('/')}`, 422);
  // de-dup, preserve order
  const tieBreak = [...new Set(tb)];
  return { id: input.id, name, participants: input.participants, scoreLabel, points: { win: p.win, draw: p.draw, loss: p.loss }, tieBreak, createdAt: input.createdAt };
}
