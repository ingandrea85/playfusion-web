/** Confirmed teams per category, read from o5 over HTTP (ADR-002: no cross-BC code import).
 *  Used to seed the gironi draw. Teams are participantRefs. */
export interface TeamSource {
  confirmedByCategory(sportEventId: string): Promise<Map<string, string[]>>;
}
