import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { WindowRepository } from '../ports/window-repository.js';
import type { RegistrationWindow } from '../domain/registration-window.js';

export class DynamoDbWindowRepository implements WindowRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = 'o5-windows') {}
  async get(sportEventId: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { sportEventId } }));
    return res.Item as RegistrationWindow | undefined;
  }
  async save(w: RegistrationWindow) {
    await this.db.send(new PutCommand({ TableName: this.table, Item: w }));
  }
}
