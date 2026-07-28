import { randomUUID } from 'node:crypto';
import { currentCorrelationId } from './correlation.js';

export type DomainEventEnvelope = {
  eventId: string;
  organizationId: string;
  occurredAt: string;
  correlationId: string;
};
export type DomainEvent<T> = { name: string; envelope: DomainEventEnvelope; payload: T };

export function makeEnvelope(organizationId: string, now: Date): DomainEventEnvelope {
  return { eventId: randomUUID(), organizationId, occurredAt: now.toISOString(), correlationId: currentCorrelationId() };
}
