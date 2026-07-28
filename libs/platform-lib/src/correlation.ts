import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage<string>();

export function withCorrelation<T>(id: string, fn: () => Promise<T>): Promise<T> {
  return als.run(id, fn);
}
export function currentCorrelationId(): string {
  return als.getStore() ?? 'no-correlation';
}
