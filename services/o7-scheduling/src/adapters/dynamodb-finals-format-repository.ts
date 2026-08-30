import { PutCommand, GetCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { FinalsFormatRepository } from '../ports.js';
import type { CustomFinalsFormat } from '../finals-format.js';

/** Global catalog table `o7-finals-formats` (PK formatId). Small catalog → Scan for list. */
export class DynamoDbFinalsFormatRepository implements FinalsFormatRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o7-finals-formats')) {}
  // Org-scoped list. The catalog is tiny (a handful of formats per org) → Scan + filter beats adding
  // a GSI. Pre-org-scoping formats (no organizationId) simply don't match any org.
  async listByOrg(organizationId: string) {
    const res = await this.db.send(new ScanCommand({
      TableName: this.table,
      FilterExpression: 'organizationId = :o', ExpressionAttributeValues: { ':o': organizationId },
    }));
    return (res.Items ?? []) as CustomFinalsFormat[];
  }
  async get(formatId: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { formatId } }));
    return res.Item as CustomFinalsFormat | undefined;
  }
  async save(format: CustomFinalsFormat) {
    // The catalog item is keyed by `formatId`; the domain object uses `id` — store both.
    await this.db.send(new PutCommand({ TableName: this.table, Item: { formatId: format.id, ...format } }));
  }
  async delete(formatId: string) {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: { formatId } }));
  }
}
