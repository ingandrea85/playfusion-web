import pino from 'pino';
import { currentCorrelationId } from './correlation.js';

export const log = pino({ base: undefined });

export function checkpoint(unit: string, phase: string, fields: Record<string, unknown> = {}): void {
  log.info({ correlationId: currentCorrelationId(), ...fields }, `[${unit} ${phase}]`);
}
