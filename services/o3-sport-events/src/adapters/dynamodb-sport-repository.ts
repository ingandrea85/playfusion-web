import { PutCommand, GetCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { SportProfile } from '../sport.js';

/** Global sport catalog `o3-sports` (PK sportId). Small catalog → Scan for list. */
export class DynamoDbSportRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o3-sports')) {}
  async list(): Promise<SportProfile[]> {
    const res = await this.db.send(new ScanCommand({ TableName: this.table }));
    return (res.Items ?? []) as SportProfile[];
  }
  async get(id: string): Promise<SportProfile | undefined> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { sportId: id } }));
    return res.Item as SportProfile | undefined;
  }
  async save(sport: SportProfile): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { sportId: sport.id, ...sport } }));
  }
  async delete(id: string): Promise<void> {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: { sportId: id } }));
  }
}
