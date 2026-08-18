/** Normalized transport error. `code` reads the backend `{error|code}` body field
 *  (handlers emit one or the other), falling back to the HTTP status text. */
export class RestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly body: unknown) {
    super(message)
    this.name = 'RestError'
  }
}
