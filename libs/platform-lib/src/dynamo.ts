import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function makeDocClient(): DynamoDBDocumentClient {
  const base = new DynamoDBClient({ endpoint: process.env.AWS_ENDPOINT_URL });
  return DynamoDBDocumentClient.from(base);
}
