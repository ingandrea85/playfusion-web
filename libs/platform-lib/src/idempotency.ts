import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export class DynamoIdempotencyStore {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table: string) {}
  async alreadyProcessed(eventId: string): Promise<boolean> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { eventId } }));
    return res.Item !== undefined;
  }
  async markProcessed(eventId: string): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { eventId, at: new Date().toISOString() } }));
  }
}
