import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { GironiRepository } from '../ports/gironi-repository.js';
import type { CategoryGironi, GironiMap } from '../gironi.js';

/** Gironi live on the o3 event item under `gironi.<categoria>`. Persisted by read-modify-write
 *  of the whole event item — gironi edits are infrequent organizer actions on one event, so the
 *  simplicity beats a nested UpdateExpression (which can't create the `gironi` map and set a key
 *  in one statement). */
export class DynamoDbGironiRepository implements GironiRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o3-events')) {}

  private async getItem(sportEventId: string): Promise<Record<string, unknown> | undefined> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { sportEventId } }));
    return res.Item as Record<string, unknown> | undefined;
  }

  async get(sportEventId: string): Promise<GironiMap> {
    const item = await this.getItem(sportEventId);
    return ((item?.gironi ?? {}) as GironiMap);
  }

  async putCategory(sportEventId: string, categoria: string, gironi: CategoryGironi): Promise<void> {
    const item = await this.getItem(sportEventId);
    if (!item) return; // no event → nothing to attach gironi to (handler guards with a 404 first)
    const map = ((item.gironi ?? {}) as GironiMap);
    map[categoria] = gironi;
    await this.db.send(new PutCommand({ TableName: this.table, Item: { ...item, gironi: map } }));
  }
}
