// Centralized per-environment resource naming (ADR-012).
//
// Physical AWS resource names follow `playfusion2-<resource>-<env>`, where <env>
// is the deploy token: `stg` (collaudo) or `pr` (produzione). Local development
// and tests default to `local`. Set PF_ENV in the deployed Lambda environment
// (wired by CDK from S0.6+).
export const PF_ENV = process.env.PF_ENV ?? 'local'

// Logical event source namespace (EventBridge `source`). Not per-environment: the
// same across stg/pr/local so rules and publishers always agree.
export const EVENT_SOURCE = 'playfusion2'

/** Physical name for a logical resource, e.g. resourceName('o3-events') -> 'playfusion2-o3-events-local'. */
export function resourceName(base: string): string {
  return `playfusion2-${base}-${PF_ENV}`
}

/** EventBridge bus name. Honors an explicit EVENT_BUS_NAME (injected by CDK in deployed envs). */
export function busName(): string {
  return process.env.EVENT_BUS_NAME ?? resourceName('bus')
}
