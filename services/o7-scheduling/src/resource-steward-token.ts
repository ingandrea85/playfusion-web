/** Resource-steward magic-link (B4): a checkout-desk-style token that lets a per-event steward
 *  check resources (showers/terzo tempo) in/out for their event only. The event id is encoded in
 *  the magic-link `subject` (no schema change to the shared token) — mirrors director-token.ts. */
export const STEWARD_ROLE = 'ResourceSteward';
export const STEWARD_PURPOSE = 'resource-steward';

/** `steward:<eventId>` — eventId is a UUID (no ':'). */
export const stewardSubject = (eventId: string): string => `steward:${eventId}`;

export function parseStewardScope(subject: string): { eventId: string } | null {
  const parts = subject.split(':');
  if (parts.length < 2 || parts[0] !== 'steward' || !parts[1]) return null;
  return { eventId: parts[1] };
}
