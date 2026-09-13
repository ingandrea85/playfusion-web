import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import type { BedrockGateway } from '../ports.js'

const MODEL_ID = process.env.O13_MODEL_ID ?? 'eu.anthropic.claude-haiku-4-5-20251001-v1:0'
const REGION = process.env.O13_BEDROCK_REGION ?? 'eu-south-1'

export function makeLiveBedrockGateway(): BedrockGateway {
  const client = new BedrockRuntimeClient({ region: REGION })
  return {
    async complete(prompt: string): Promise<string> {
      let out
      try {
        out = await client.send(new ConverseCommand({
          modelId: MODEL_ID,
          // maxTokens 2000 truncated multi-category drafts → invalid JSON; 4096 gives headroom.
          messages: [{ role: 'user', content: [{ text: prompt }] }],
          inferenceConfig: { maxTokens: 4096, temperature: 0 },
        }))
      } catch (e) {
        // [o13-diag] surface Bedrock runtime failures (IAM AccessDenied, throttling, model id).
        console.error('[o13-diag] bedrock-error', JSON.stringify({ name: (e as Error).name, message: (e as Error).message, modelId: MODEL_ID, region: REGION }))
        throw e
      }
      const block = out.output?.message?.content?.find((b) => typeof (b as { text?: string }).text === 'string')
      const text = (block as { text?: string } | undefined)?.text ?? ''
      console.error('[o13-diag] bedrock-ok', JSON.stringify({ stopReason: out.stopReason, len: text.length, head: text.slice(0, 200) }))
      return text
    },
  }
}
