import { PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { BrandRepository } from '../ports.js';
import type { Brand } from '../domain.js';

/** One item per organization: { organizationId, brand?: Brand }. */
export class DynamoDbBrandRepository implements BrandRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o1-organizations')) {}

  async get(organizationId: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { organizationId } }));
    return (res.Item?.brand as Brand | undefined) ?? null;
  }

  async save(organizationId: string, brand: Brand) {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { organizationId, brand } }));
  }

  async delete(organizationId: string) {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: { organizationId } }));
  }
}
