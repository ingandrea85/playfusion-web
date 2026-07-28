// Integration-test environment defaults for talking to LocalStack.
// Set each only if unset, so CI or the host can still override.
// Production Lambdas get region + credentials from the AWS runtime, not from here;
// this file exists solely so `.it.test.ts` runs are self-sufficient in a clean
// environment (e.g. the VSCode devcontainer), without inline env on the command.
process.env.AWS_ENDPOINT_URL ??= 'http://localhost:4566';
process.env.AWS_REGION ??= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
// Env token for the playfusion2-<resource>-<env> convention (ADR-012). Local/tests
// use `local`; the bus name is then derived by busName() (no legacy EVENT_BUS_NAME).
process.env.PF_ENV ??= 'local';
