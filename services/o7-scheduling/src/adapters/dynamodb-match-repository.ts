import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { ScheduledMatch } from '../domain.js';
import type { MatchRepository } from '../ports.js';

/** All of an event's fixtures live in a single item (keyed by sportEventId) holding the
 *  match array, so a regenerate is one Put and a read is one Get — no GSI, no batch
 *  delete. A calendar is bounded (well under the 400 KB item limit for MVP sizes). */
export class DynamoDbMatchRepository implements MatchRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o7-matches')) {}

  async list(sportEventId: string): Promise<ScheduledMatch[]> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { sportEventId } }));
    return ((res.Item?.matches ?? []) as ScheduledMatch[]);
  }

  async replace(sportEventId: string, matches: ScheduledMatch[]): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { sportEventId, matches } }));
  }
}
