import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { resourceName } from '@playfusion/platform-lib'
import type { UsageStore } from '../ports.js'

const NINETY_DAYS = 90 * 24 * 3600

export class DynamoUsageStore implements UsageStore {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o13-usage')) {}
  async count(organizationId: string, month: string): Promise<number> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { organizationId, month } }))
    return (res.Item as { count?: number } | undefined)?.count ?? 0
  }
  async increment(organizationId: string, month: string): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + NINETY_DAYS
    await this.db.send(new UpdateCommand({
      TableName: this.table, Key: { organizationId, month },
      UpdateExpression: 'SET #ttl = if_not_exists(#ttl, :ttl) ADD #c :one',
      ExpressionAttributeNames: { '#c': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':one': 1, ':ttl': ttl },
    }))
  }
}
