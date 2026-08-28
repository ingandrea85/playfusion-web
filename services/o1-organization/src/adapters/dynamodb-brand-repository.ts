import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { BrandRepository, SiteDefaultsRepository } from '../ports.js';
import type { Brand, OrgSiteDefaults } from '../domain.js';

/**
 * One item per organization: { organizationId, brand?, siteDefaults? }. Brand and siteDefaults are
 * independent attributes updated in place (UpdateCommand SET/REMOVE) so writing one never clobbers
 * the other.
 */
export class DynamoDbBrandRepository implements BrandRepository, SiteDefaultsRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o1-organizations')) {}

  private async read(organizationId: string): Promise<Record<string, unknown> | undefined> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { organizationId } }));
    return res.Item as Record<string, unknown> | undefined;
  }

  async get(organizationId: string) {
    return ((await this.read(organizationId))?.brand as Brand | undefined) ?? null;
  }
  async save(organizationId: string, brand: Brand) {
    await this.db.send(new UpdateCommand({
      TableName: this.table, Key: { organizationId },
      UpdateExpression: 'SET brand = :b', ExpressionAttributeValues: { ':b': brand },
    }));
  }
  async delete(organizationId: string) {
    await this.db.send(new UpdateCommand({
      TableName: this.table, Key: { organizationId }, UpdateExpression: 'REMOVE brand',
    }));
  }

  async getSite(organizationId: string) {
    return ((await this.read(organizationId))?.siteDefaults as OrgSiteDefaults | undefined) ?? null;
  }
  async saveSite(organizationId: string, site: OrgSiteDefaults) {
    await this.db.send(new UpdateCommand({
      TableName: this.table, Key: { organizationId },
      UpdateExpression: 'SET siteDefaults = :s', ExpressionAttributeValues: { ':s': site },
    }));
  }
}
