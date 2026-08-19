import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { TieOverride } from '../domain.js';
import type { TieOverrideRepository } from '../ports.js';

/** S11: all of an event's manual tie-break resolutions live in a single item (keyed by
 *  sportEventId) holding the override array — mirrors the match repo (one Get / one Put, no GSI).
 *  `upsert` replaces any existing override for the same (categoryId, groupLabel). */
export class DynamoDbTieOverrideRepository implements TieOverrideRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o7-tie-overrides')) {}

  async list(sportEventId: string): Promise<TieOverride[]> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { sportEventId } }));
    return (res.Item?.overrides ?? []) as TieOverride[];
  }

  async upsert(override: TieOverride): Promise<void> {
    const existing = await this.list(override.sportEventId);
    const overrides = existing.filter((o) => !(o.categoryId === override.categoryId && o.groupLabel === override.groupLabel));
    overrides.push(override);
    await this.db.send(new PutCommand({ TableName: this.table, Item: { sportEventId: override.sportEventId, overrides } }));
  }
}
