/** A single header the client attaches to authenticated calls. */
export interface AuthHeader { name: string; value: string }
/** Resolves the auth header per call (E1: Auth0 access token; E3: coach magic-link).
 *  Returning null sends the request unauthenticated (public reads). */
export type AuthProvider = () => AuthHeader | null | Promise<AuthHeader | null>
/** Both organizer JWTs and coach magic-links travel as `Authorization: Bearer <token>`. */
export const bearer = (token: string): AuthHeader => ({ name: 'authorization', value: `Bearer ${token}` })
