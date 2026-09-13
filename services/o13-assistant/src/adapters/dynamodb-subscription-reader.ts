import { GetCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { resourceName } from '@playfusion/platform-lib'
import type { SubscriptionReader } from '../ports.js'

export class DynamoSubscriptionReader implements SubscriptionReader {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o11-subscriptions')) {}
  async getPlanAndStatus(organizationId: string): Promise<{ plan: string; status: string }> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { organizationId } }))
    const item = res.Item as { plan?: string; status?: string } | undefined
    return { plan: item?.plan ?? 'FREE', status: item?.status ?? 'ACTIVE' }
  }
}
