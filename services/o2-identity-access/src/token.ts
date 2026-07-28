import { createHmac } from 'node:crypto';
const SECRET = process.env.PILOT_TOKEN_SECRET ?? 'pilot-dev-secret';
export function signToken(subject: string, roles: string[]): string {
  const body = Buffer.from(JSON.stringify({ subject, roles })).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyToken(token: string): { subject: string; roles: string[] } | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig !== expected) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString());
}
