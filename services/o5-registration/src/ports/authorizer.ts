export interface Authorizer {
  hasRegistrationManagerRole(token: string): Promise<boolean>;
}
