import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function makeDocClient(): DynamoDBDocumentClient {
  const base = new DynamoDBClient({ endpoint: process.env.AWS_ENDPOINT_URL });
  // removeUndefinedValues: the DocumentClient otherwise THROWS on any undefined value nested in a
  // map/list (e.g. an optional venue.address left blank), which surfaced as failed site saves.
  return DynamoDBDocumentClient.from(base, { marshallOptions: { removeUndefinedValues: true } });
}
