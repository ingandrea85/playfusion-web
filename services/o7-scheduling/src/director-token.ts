/** Field-director magic-link (S25): a coach-style token that lets a per-field director report
 *  results only for their field. The event id + field are encoded in the magic-link `subject`
 *  (no schema change to the shared token). */
export const DIRECTOR_ROLE = 'director';
export const DIRECTOR_PURPOSE = 'field-director';

/** `director:<eventId>:<encodeURIComponent(field)>` — eventId is a UUID (no ':'), the field is
 *  percent-encoded so it can't contain a raw ':'. */
export function directorSubject(eventId: string, field: string): string {
  return `director:${eventId}:${encodeURIComponent(field)}`;
}

export function parseDirectorScope(subject: string): { eventId: string; field: string } | null {
  const parts = subject.split(':');
  if (parts.length < 3 || parts[0] !== 'director' || !parts[1]) return null;
  return { eventId: parts[1], field: decodeURIComponent(parts.slice(2).join(':')) };
}
