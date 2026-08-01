/** The authenticated actor behind a request, produced by a verifier and carried on the
 *  request context. `source` records which credential proved it (S2). */
export type IdentitySource = 'auth0' | 'magic-link';

export interface Identity {
  subject: string;
  roles: string[];
  organizationId?: string;
  source: IdentitySource;
}
