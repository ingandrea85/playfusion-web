import { PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { MemberRepository, InvitationRepository } from '../ports.js';
import type { Member, Invitation } from '../membership.js';

export class DynamoDbMemberRepository implements MemberRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o2-members')) {}
  async listByOrg(organizationId: string) {
    const res = await this.db.send(new QueryCommand({
      TableName: this.table, IndexName: 'org-index',
      KeyConditionExpression: 'organizationId = :o', ExpressionAttributeValues: { ':o': organizationId },
    }));
    return (res.Items ?? []) as Member[];
  }
  async get(memberId: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { memberId } }));
    return res.Item as Member | undefined;
  }
  async save(member: Member) { await this.db.send(new PutCommand({ TableName: this.table, Item: { ...member } })); }
  async delete(memberId: string) { await this.db.send(new DeleteCommand({ TableName: this.table, Key: { memberId } })); }
}

export class DynamoDbInvitationRepository implements InvitationRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o2-invitations')) {}
  async listByOrg(organizationId: string) {
    const res = await this.db.send(new QueryCommand({
      TableName: this.table, IndexName: 'org-index',
      KeyConditionExpression: 'organizationId = :o', ExpressionAttributeValues: { ':o': organizationId },
    }));
    return (res.Items ?? []) as Invitation[];
  }
  async get(invitationId: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { invitationId } }));
    return res.Item as Invitation | undefined;
  }
  async save(invitation: Invitation) { await this.db.send(new PutCommand({ TableName: this.table, Item: { ...invitation } })); }
  async delete(invitationId: string) { await this.db.send(new DeleteCommand({ TableName: this.table, Key: { invitationId } })); }
}
