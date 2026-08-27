import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { resourceName, busName } from './naming.js';

export interface DataStackProps extends StackProps {
  /** Env token (stg|pr|local) — drives per-env physical naming (S0.10). */
  readonly appEnv: string;
}

/**
 * S0.6 — per-Bounded-Context DynamoDB tables + the shared EventBridge bus.
 * Mirrors scripts/provision.ts (the LocalStack provisioner) so local and deployed
 * topologies match. EventBridge rules/targets are wired in the ApiStack (S0.7),
 * where the Lambda targets exist.
 */
export class DataStack extends Stack {
  readonly bus: EventBus;
  readonly tables: Record<string, Table> = {};

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const env = props.appEnv;
    // Non-prod is disposable; prod retains data on stack delete.
    const removalPolicy = env === 'pr' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    const table = (base: string, partitionKey: string): Table =>
      new Table(this, base, {
        tableName: resourceName(base, env),
        partitionKey: { name: partitionKey, type: AttributeType.STRING },
        billingMode: BillingMode.PAY_PER_REQUEST,
        removalPolicy,
      });

    // O5 registration: registrations (+ pe-index GSI), windows, participants directory
    const registrations = table('o5-registrations', 'registrationId');
    registrations.addGlobalSecondaryIndex({
      indexName: 'pe-index',
      partitionKey: { name: 'pe', type: AttributeType.STRING },
    });
    // event-index: list registrations per event (+state filter) — S1.3/S1.4.
    registrations.addGlobalSecondaryIndex({
      indexName: 'event-index',
      partitionKey: { name: 'sportEventId', type: AttributeType.STRING },
    });
    this.tables['o5-registrations'] = registrations;
    this.tables['o5-windows'] = table('o5-windows', 'sportEventId');
    this.tables['o5-participants'] = table('o5-participants', 'participantRef');
    // O5 consumer idempotency store
    this.tables['o5-processed-events'] = table('o5-processed-events', 'eventId');

    // Other BCs' primary stores
    // O3 events: + org-index GSI so S1.2 can list events per organization.
    const events = table('o3-events', 'sportEventId');
    events.addGlobalSecondaryIndex({
      indexName: 'org-index',
      partitionKey: { name: 'organizationId', type: AttributeType.STRING },
    });
    this.tables['o3-events'] = events;
    this.tables['o4-participants'] = table('o4-participants', 'participantId');
    this.tables['o2-identities'] = table('o2-identities', 'subject');
    // O2 membership (S19): members + invitations per org; org-index GSI to list per tenant.
    for (const base of ['o2-members', 'o2-invitations'] as const) {
      const pk = base === 'o2-members' ? 'memberId' : 'invitationId';
      const t = table(base, pk);
      t.addGlobalSecondaryIndex({ indexName: 'org-index', partitionKey: { name: 'organizationId', type: AttributeType.STRING } });
      this.tables[base] = t;
    }
    // O12 fees: + event-index GSI so S4 can list fee status per event.
    const fees = table('o12-fees', 'registrationId');
    fees.addGlobalSecondaryIndex({
      indexName: 'event-index',
      partitionKey: { name: 'sportEventId', type: AttributeType.STRING },
    });
    this.tables['o12-fees'] = fees;

    // O7 scheduling (S7): the Schedule aggregate + the event's fixtures, both keyed by
    // sportEventId (matches stored as a single item holding the array — see the match repo).
    this.tables['o7-schedules'] = table('o7-schedules', 'sportEventId');
    this.tables['o7-matches'] = table('o7-matches', 'sportEventId');
    this.tables['o7-tie-overrides'] = table('o7-tie-overrides', 'sportEventId');
    this.tables['o7-resources'] = table('o7-resources', 'sportEventId'); // S17
    this.tables['o7-finals-formats'] = table('o7-finals-formats', 'formatId'); // SP1: global custom finals formats

    // O1 organization (S18): per-tenant brand identity (presentation metadata), keyed by org.
    this.tables['o1-organizations'] = table('o1-organizations', 'organizationId');
    // O11 subscriptions (S20): one subscription per org (trial-first billing).
    this.tables['o11-subscriptions'] = table('o11-subscriptions', 'organizationId');

    // O9 communications (S15): announcements per event; event-index GSI to list per event.
    const announcements = table('o9-announcements', 'announcementId');
    announcements.addGlobalSecondaryIndex({
      indexName: 'event-index',
      partitionKey: { name: 'sportEventId', type: AttributeType.STRING },
    });
    this.tables['o9-announcements'] = announcements;

    // Shared domain-event bus (source = EVENT_SOURCE, same across envs)
    this.bus = new EventBus(this, 'bus', { eventBusName: busName(env) });
  }
}
