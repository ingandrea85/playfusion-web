export interface SubscriptionReader {
  getPlanAndStatus(organizationId: string): Promise<{ plan: string; status: string }>
}
export interface UsageStore {
  count(organizationId: string, month: string): Promise<number>
  increment(organizationId: string, month: string): Promise<void>
}
export interface BedrockGateway {
  complete(prompt: string): Promise<string>
}
