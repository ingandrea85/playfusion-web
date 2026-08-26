import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { SubscriptionRepository } from '../ports.js';
import type { Subscription } from '../domain.js';

/** One item per organization: the current subscription. */
export class DynamoDbSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o11-subscriptions')) {}
  async get(organizationId: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { organizationId } }));
    return res.Item as Subscription | undefined;
  }
  async save(subscription: Subscription) {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { ...subscription } }));
  }
}
