import type { Authorizer } from '../ports/authorizer.js';
// Pilot-grade: verifies the O2-issued token's claim. O5 does NOT import O2 code (ADR-002);
// it calls O2's verify endpoint over HTTP, OR verifies via the shared token contract.
// For the Pilot, verify against O2's /identities/verify (network call, not a code import).
export class HttpClaimAuthorizer implements Authorizer {
  constructor(private readonly o2BaseUrl = process.env.O2_BASE_URL ?? 'http://localhost:4566/restapis/o2/local/_user_request_') {}
  async hasRegistrationManagerRole(token: string): Promise<boolean> {
    const res = await fetch(`${this.o2BaseUrl}/identities/verify`, { headers: { authorization: token } });
    if (!res.ok) return false;
    const claims = (await res.json()) as { roles?: string[] };
    return (claims.roles ?? []).includes('RegistrationManager');
  }
}
