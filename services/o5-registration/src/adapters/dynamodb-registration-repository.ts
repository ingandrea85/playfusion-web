import { PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { RegistrationRepository } from '../ports/registration-repository.js';
import type { RegistrationRequest } from '../domain/registration.js';

export class DynamoDbRegistrationRepository implements RegistrationRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = 'o5-registrations') {}
  async save(r: RegistrationRequest) {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { ...r, pe: `${r.participantRef}#${r.sportEventId}` } }));
  }
  async get(id: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { registrationId: id } }));
    return res.Item as RegistrationRequest | undefined;
  }
  async findByParticipantAndEvent(participantRef: string, sportEventId: string) {
    const res = await this.db.send(new QueryCommand({
      TableName: this.table, IndexName: 'pe-index',
      KeyConditionExpression: 'pe = :pe',
      ExpressionAttributeValues: { ':pe': `${participantRef}#${sportEventId}` },
    }));
    return res.Items?.[0] as RegistrationRequest | undefined;
  }
}
