import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import type { BedrockGateway } from '../ports.js'

const MODEL_ID = process.env.O13_MODEL_ID ?? 'eu.anthropic.claude-haiku-4-5-20251001-v1:0'
const REGION = process.env.O13_BEDROCK_REGION ?? 'eu-south-1'

export function makeLiveBedrockGateway(): BedrockGateway {
  const client = new BedrockRuntimeClient({ region: REGION })
  return {
    async complete(prompt: string): Promise<string> {
      const out = await client.send(new ConverseCommand({
        modelId: MODEL_ID,
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 2000, temperature: 0.2 },
      }))
      const block = out.output?.message?.content?.find((b) => typeof (b as { text?: string }).text === 'string')
      return (block as { text?: string } | undefined)?.text ?? ''
    },
  }
}
