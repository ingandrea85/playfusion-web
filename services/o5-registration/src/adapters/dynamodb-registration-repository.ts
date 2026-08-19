import { PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { RegistrationRepository } from '../ports/registration-repository.js';
import type { RegistrationRequest, RegistrationStatus } from '../domain/registration.js';

export class DynamoDbRegistrationRepository implements RegistrationRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o5-registrations')) {}
  async save(r: RegistrationRequest) {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { ...r, pe: `${r.participantRef}#${r.sportEventId}` } }));
  }
  async get(id: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { registrationId: id } }));
    return res.Item as RegistrationRequest | undefined;
  }
  async deleteById(id: string) {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: { registrationId: id } }));
  }
  async findByParticipantAndEvent(participantRef: string, sportEventId: string) {
    const res = await this.db.send(new QueryCommand({
      TableName: this.table, IndexName: 'pe-index',
      KeyConditionExpression: 'pe = :pe',
      ExpressionAttributeValues: { ':pe': `${participantRef}#${sportEventId}` },
    }));
    return res.Items?.[0] as RegistrationRequest | undefined;
  }
  async findByEvent(sportEventId: string, state?: RegistrationStatus) {
    // `status` is a DynamoDB reserved word, so it is aliased when filtering.
    const res = await this.db.send(new QueryCommand({
      TableName: this.table, IndexName: 'event-index',
      KeyConditionExpression: 'sportEventId = :e',
      ...(state ? { FilterExpression: '#s = :s', ExpressionAttributeNames: { '#s': 'status' } } : {}),
      ExpressionAttributeValues: { ':e': sportEventId, ...(state ? { ':s': state } : {}) },
    }));
    return (res.Items ?? []) as RegistrationRequest[];
  }
}
