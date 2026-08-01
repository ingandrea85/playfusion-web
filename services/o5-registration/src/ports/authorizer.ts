/** @deprecated S2.4 moved authorization to the platform-lib `requireOrganizer` middleware.
 *  No longer wired; kept pending removal. */
export interface Authorizer {
  hasRegistrationManagerRole(token: string): Promise<boolean>;
}
