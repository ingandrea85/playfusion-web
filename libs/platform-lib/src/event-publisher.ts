export interface EventPublisher {
  publish(name: string, payload: Record<string, unknown>, organizationId: string): Promise<void>;
}
