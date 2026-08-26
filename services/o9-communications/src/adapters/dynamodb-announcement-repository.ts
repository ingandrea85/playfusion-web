import { PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { AnnouncementRepository } from '../ports.js';
import type { Announcement } from '../domain.js';

export class DynamoDbAnnouncementRepository implements AnnouncementRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o9-announcements')) {}

  async save(a: Announcement) {
    // categoryId can be null (whole event); DynamoDB stores null fine, but keep the item explicit.
    await this.db.send(new PutCommand({ TableName: this.table, Item: { ...a } }));
  }

  async get(announcementId: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { announcementId } }));
    return res.Item as Announcement | undefined;
  }

  async delete(announcementId: string) {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: { announcementId } }));
  }

  async listByEvent(sportEventId: string) {
    const res = await this.db.send(new QueryCommand({
      TableName: this.table, IndexName: 'event-index',
      KeyConditionExpression: 'sportEventId = :e',
      ExpressionAttributeValues: { ':e': sportEventId },
    }));
    return (res.Items ?? []) as Announcement[];
  }
}
