import type { TeamSource } from '../ports/team-source.js';

/** Stage root injected by CDK as PF_API_BASE_URL; o3 reaches o5 over HTTP (ADR-002).
 *  Defaults to the LocalStack REST mount so dev works without extra env. */
const apiBase = (): string =>
  process.env.PF_API_BASE_URL ?? 'http://localhost:4566/restapis/api/local/_user_request_';

/** Reads o5 confirmed registrations and buckets the team label by categoria — the seed for the
 *  gironi draw. The label is the real `teamName` when set (S14 / PB-2) else `participantRef` (PB-1). */
export class HttpTeamSource implements TeamSource {
  constructor(private readonly base = apiBase(), private readonly doFetch: typeof fetch = fetch) {}
  async confirmedByCategory(sportEventId: string): Promise<Map<string, string[]>> {
    const res = await this.doFetch(`${this.base}/o5/events/${encodeURIComponent(sportEventId)}/registrations?state=Confirmed`);
    const byCat = new Map<string, string[]>();
    if (!res.ok) return byCat;
    const rows = (await res.json()) as Array<{ participantRef: string; categoria: string; status: string; teamName?: string }>;
    for (const r of rows) {
      if (r.status !== 'Confirmed') continue;
      const list = byCat.get(r.categoria) ?? [];
      list.push(r.teamName?.trim() || r.participantRef);
      byCat.set(r.categoria, list);
    }
    return byCat;
  }
}
