import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { EventReadStore } from '../ports/event-read-store.js';
import type { SportEvent } from '../domain.js';

export class DynamoDbEventStore implements EventReadStore {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o3-events')) {}

  async listByOrg(organizationId: string): Promise<SportEvent[]> {
    const res = await this.db.send(new QueryCommand({
      TableName: this.table, IndexName: 'org-index',
      KeyConditionExpression: 'organizationId = :o',
      ExpressionAttributeValues: { ':o': organizationId },
    }));
    return (res.Items ?? []) as SportEvent[];
  }

  async get(sportEventId: string): Promise<SportEvent | undefined> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { sportEventId } }));
    return res.Item as SportEvent | undefined;
  }
}
