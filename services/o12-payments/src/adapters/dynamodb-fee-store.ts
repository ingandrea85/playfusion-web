import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { FeeReadStore, FeeRecord } from '../ports/fee-read-store.js';

export class DynamoDbFeeStore implements FeeReadStore {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o12-fees')) {}
  async listByEvent(sportEventId: string): Promise<FeeRecord[]> {
    const res = await this.db.send(new QueryCommand({
      TableName: this.table, IndexName: 'event-index',
      KeyConditionExpression: 'sportEventId = :e',
      ExpressionAttributeValues: { ':e': sportEventId },
    }));
    return (res.Items ?? []) as FeeRecord[];
  }
}
