// Test-support helper: boots a REAL O2 process (over HTTP, on an ephemeral port) so O5's
// integration tests can exercise HttpClaimAuthorizer end-to-end. This spawns O2 as a child
// process (via tsx) rather than importing any `o2-identity-access` module — O5's test tree,
// like its production code, must never cross-import another BC's code (ADR-002 / ESLint
// no-restricted-imports). Communication happens exclusively over HTTP.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const o2ServeScript = path.resolve(here, '../../../o2-identity-access/test/serve-standalone.ts');
const tsxBin = path.resolve(here, '../../../../node_modules/.bin/tsx');

export type SpawnedO2 = { baseUrl: string; stop: () => Promise<void> };

export async function spawnO2(): Promise<SpawnedO2> {
  const child: ChildProcessWithoutNullStreams = spawn(tsxBin, [o2ServeScript], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const port = await new Promise<number>((resolve, reject) => {
    let buffered = '';
    const onData = (chunk: Buffer) => {
      buffered += chunk.toString();
      const match = buffered.match(/O2_LISTENING_ON=(\d+)/);
      if (match) {
        child.stdout.off('data', onData);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk: Buffer) => { buffered += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== null && code !== 0) reject(new Error(`O2 child process exited early (code ${code}): ${buffered}`));
    });
    setTimeout(() => reject(new Error(`O2 child process did not report a listening port in time: ${buffered}`)), 10_000);
  });

  return {
    baseUrl: `http://localhost:${port}`,
    stop: () => new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    }),
  };
}
