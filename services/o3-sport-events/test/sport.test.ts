import { describe, it, expect } from 'vitest';
import { makeSportProfile } from '../src/sport.js';

const base = { id: 's1', createdAt: 't0', name: 'Tennis', participants: 'both' as const, scoreLabel: 'Set', points: { win: 2, draw: null, loss: 0 }, tieBreak: ['HEAD_TO_HEAD', 'SCORE_DIFFERENCE'] as const };

describe('makeSportProfile', () => {
  it('normalises a valid profile (trims, de-dups tie-break)', () => {
    const s = makeSportProfile({ ...base, name: '  Tennis  ', scoreLabel: ' Set ', tieBreak: ['HEAD_TO_HEAD', 'HEAD_TO_HEAD', 'SCORE_FOR'] });
    expect(s).toMatchObject({ name: 'Tennis', scoreLabel: 'Set', participants: 'both', points: { win: 2, draw: null, loss: 0 } });
    expect(s.tieBreak).toEqual(['HEAD_TO_HEAD', 'SCORE_FOR']);
  });
  it('accepts a draw-based points policy', () => {
    expect(makeSportProfile({ ...base, name: 'Calcio', participants: 'team', scoreLabel: 'Reti', points: { win: 3, draw: 1, loss: 0 } }).points.draw).toBe(1);
  });
  it('rejects empty name / scoreLabel', () => {
    expect(() => makeSportProfile({ ...base, name: '  ' })).toThrowError(/name is required/);
    expect(() => makeSportProfile({ ...base, scoreLabel: '' })).toThrowError(/scoreLabel is required/);
  });
  it('rejects an unknown participants kind', () => {
    expect(() => makeSportProfile({ ...base, participants: 'squadra' as any })).toThrowError(/participants must be/);
  });
  it('rejects a malformed points object and unknown tie-break', () => {
    expect(() => makeSportProfile({ ...base, points: { win: 'x' as any, draw: null, loss: 0 } })).toThrowError(/points must be/);
    expect(() => makeSportProfile({ ...base, tieBreak: ['GOAL_DIFFERENCE'] as any })).toThrowError(/tieBreak must be/);
  });
});
