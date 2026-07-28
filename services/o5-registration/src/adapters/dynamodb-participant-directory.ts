import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { ParticipantDirectory } from '../ports/participant-directory.js';

export class DynamoDbParticipantDirectory implements ParticipantDirectory {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o5-participants')) {}
  async exists(participantRef: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { participantRef } }));
    return res.Item !== undefined;
  }
  async add(participantRef: string) {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { participantRef } }));
  }
}
