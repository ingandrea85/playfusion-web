import type { Subscription } from './domain.js';

export interface SubscriptionRepository {
  get(organizationId: string): Promise<Subscription | undefined>;
  save(subscription: Subscription): Promise<void>;
}
