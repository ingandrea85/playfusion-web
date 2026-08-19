import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { ResourceConfig } from '../resources.js';
import type { ResourceRepository } from '../ports.js';

/** S17: one resource-config item per event, keyed by sportEventId. */
export class DynamoDbResourceRepository implements ResourceRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o7-resources')) {}

  async get(sportEventId: string): Promise<ResourceConfig | undefined> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { sportEventId } }));
    return res.Item ? (res.Item.config as ResourceConfig) : undefined;
  }

  async save(sportEventId: string, config: ResourceConfig): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { sportEventId, config } }));
  }
}
