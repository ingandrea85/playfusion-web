import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { FinalsConfig, FinalsConfigRepository } from '../ports/finals-config-repository.js';

/** S12: finals config lives on the o3 event item (`finalsType` + `qualifiersPerGroup`). Persisted by
 *  read-modify-write of the whole event item (same rationale as the gironi repo). */
export class DynamoDbFinalsConfigRepository implements FinalsConfigRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o3-events')) {}

  async setFinalsConfig(sportEventId: string, config: FinalsConfig): Promise<void> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { sportEventId } }));
    const item = res.Item as Record<string, unknown> | undefined;
    if (!item) return; // no event → nothing to attach config to (handler guards with a 404 first)
    await this.db.send(new PutCommand({ TableName: this.table, Item: {
      ...item,
      finalsType: config.finalsType,
      qualifiersPerGroup: config.qualifiersPerGroup,
      finalsEnabled: config.finalsEnabled ?? true,
      ...(config.finalsTeamsToBracket !== undefined ? { finalsTeamsToBracket: config.finalsTeamsToBracket } : {}),
    } }));
  }
}
