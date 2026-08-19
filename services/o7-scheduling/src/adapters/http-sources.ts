import type { EventSource, EventView, TeamSource } from '../ports.js';

/** Base URL of the API Gateway stage root (injected by CDK as PF_API_BASE_URL). o7 reaches
 *  o3/o5 over HTTP rather than importing their code (ADR-002). Defaults to the LocalStack
 *  REST mount so integration/dev works without extra env. */
const apiBase = (): string =>
  process.env.PF_API_BASE_URL ?? 'http://localhost:4566/restapis/api/local/_user_request_';

/** Reads the o3 event (dates + categorie) needed to place fixtures. */
export class HttpEventSource implements EventSource {
  constructor(private readonly base = apiBase(), private readonly doFetch: typeof fetch = fetch) {}
  async get(sportEventId: string): Promise<EventView | undefined> {
    const res = await this.doFetch(`${this.base}/o3/events/${encodeURIComponent(sportEventId)}`);
    if (res.status === 404) return undefined;
    if (!res.ok) return undefined;
    const e = (await res.json()) as EventView;
    return { sportEventId: e.sportEventId, dates: e.dates, categorie: e.categorie ?? [], gironi: e.gironi, sport: e.sport, tieBreak: e.tieBreak };
  }
}

/** Reads o5 confirmed registrations and buckets their participantRef by categoria. */
export class HttpTeamSource implements TeamSource {
  constructor(private readonly base = apiBase(), private readonly doFetch: typeof fetch = fetch) {}
  async confirmedByCategory(sportEventId: string): Promise<Map<string, string[]>> {
    const res = await this.doFetch(`${this.base}/o5/events/${encodeURIComponent(sportEventId)}/registrations?state=Confirmed`);
    const byCat = new Map<string, string[]>();
    if (!res.ok) return byCat;
    const rows = (await res.json()) as Array<{ participantRef: string; categoria: string; status: string }>;
    for (const r of rows) {
      if (r.status !== 'Confirmed') continue;
      const list = byCat.get(r.categoria) ?? [];
      list.push(r.participantRef);
      byCat.set(r.categoria, list);
    }
    return byCat;
  }
}
