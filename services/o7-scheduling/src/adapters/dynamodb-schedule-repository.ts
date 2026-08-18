import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { Schedule } from '../domain.js';
import type { ScheduleRepository } from '../ports.js';

/** One item per event, keyed by sportEventId. */
export class DynamoDbScheduleRepository implements ScheduleRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o7-schedules')) {}

  async get(sportEventId: string): Promise<Schedule | undefined> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { sportEventId } }));
    return res.Item as Schedule | undefined;
  }

  async save(schedule: Schedule): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: schedule }));
  }
}
