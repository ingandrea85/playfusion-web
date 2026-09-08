import { QueryCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import { checkoffSk, type Checkoff } from '../resources.js';
import type { CheckoffRepository } from '../ports.js';

/** B2: one check-off item per (day, nodeId, team), keyed by (sportEventId, sk=checkoffSk(...)). */
export class DynamoDbCheckoffRepository implements CheckoffRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o7-checkoffs')) {}

  async list(sportEventId: string): Promise<Checkoff[]> {
    const res = await this.db.send(new QueryCommand({ TableName: this.table, KeyConditionExpression: 'sportEventId = :e', ExpressionAttributeValues: { ':e': sportEventId } }));
    return (res.Items ?? []).map((i) => ({ sportEventId, nodeId: i.nodeId, day: i.day, team: i.team, servedAt: i.servedAt }));
  }

  async put(c: Checkoff): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { sportEventId: c.sportEventId, sk: checkoffSk(c.day, c.nodeId, c.team), nodeId: c.nodeId, day: c.day, team: c.team, servedAt: c.servedAt } }));
  }

  async delete(sportEventId: string, day: string, nodeId: string, team: string): Promise<void> {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: { sportEventId, sk: checkoffSk(day, nodeId, team) } }));
  }
}
