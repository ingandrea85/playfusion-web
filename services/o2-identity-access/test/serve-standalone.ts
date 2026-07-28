// Test-support entrypoint: boots O2's Hono app on a real HTTP port so OTHER packages'
// integration tests can reach O2 over the network (never via a code import — ADR-002).
// Meant to be spawned as a child process (see o5-registration's authorizer/registration-flow
// integration tests), never imported directly by another package's source or test code.
import { serve } from '@hono/node-server';
import { app } from '../src/handler.js';

const port = Number(process.env.PORT ?? 0);
const server = serve({ fetch: app.fetch, port }, (info) => {
  // Emitted once listening; the parent process parses this line to discover the bound port.
  console.log(`O2_LISTENING_ON=${info.port}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
