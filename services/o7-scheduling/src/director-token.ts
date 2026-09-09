/** Field-director magic-link (S25, per-category since the director rework): a coach-style token that
 *  lets a director report results for one CATEGORY (across all its fields). The event id + category
 *  are encoded in the magic-link `subject` (no schema change to the shared token). The E3 director
 *  view offers a per-field filter on top. */
export const DIRECTOR_ROLE = 'director';
export const DIRECTOR_PURPOSE = 'field-director';

/** `director:<eventId>:<encodeURIComponent(category)>` — eventId is a UUID (no ':'), the category is
 *  percent-encoded so it can't contain a raw ':'. */
export function directorSubject(eventId: string, category: string): string {
  return `director:${eventId}:${encodeURIComponent(category)}`;
}

export function parseDirectorScope(subject: string): { eventId: string; category: string } | null {
  const parts = subject.split(':');
  if (parts.length < 3 || parts[0] !== 'director' || !parts[1]) return null;
  return { eventId: parts[1], category: decodeURIComponent(parts.slice(2).join(':')) };
}
