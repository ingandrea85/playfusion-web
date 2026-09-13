import { makeDocClient } from '@playfusion/platform-lib'
import type { Deps } from './application/draft.js'
import { DynamoUsageStore } from './adapters/dynamodb-usage-store.js'
import { DynamoSubscriptionReader } from './adapters/dynamodb-subscription-reader.js'
import { makeLiveBedrockGateway } from './adapters/bedrock-gateway-live.js'

export function defaultDeps(): Deps {
  const db = makeDocClient()
  return {
    subs: new DynamoSubscriptionReader(db),
    usage: new DynamoUsageStore(db),
    ai: makeLiveBedrockGateway(),
  }
}
