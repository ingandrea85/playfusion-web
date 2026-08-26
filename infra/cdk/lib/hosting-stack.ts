import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  Distribution,
  ViewerProtocolPolicy,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, ARecord, AaaaRecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { resourceName } from './naming.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..', '..');

export interface HostingStackProps extends StackProps {
  readonly appEnv: string;
  /** Prod only: the apex domain + a us-east-1 ACM certificate ARN. When set (and env=pr), the
   *  distribution serves the custom domain and Route 53 apex A/AAAA aliases point at CloudFront.
   *  Staging leaves this empty and keeps the default *.cloudfront.net domain. */
  readonly domain?: { name: string; certificateArn: string };
}

// Path-based hosting per Experience (R7): each app is served from its own key prefix
// behind a dedicated CloudFront behaviour, off one S3 origin.
const APPS = [
  { name: 'e1', prefix: 'e1', title: 'E1 — Organizer' },
  { name: 'e3', prefix: 'e3', title: 'E3 — Public' },
];

/**
 * S3.2/S3.3 — S3 + CloudFront static hosting with path-based behaviours per Experience.
 * Default behaviour serves E3 (public); `e1/*` and `e3/*` route to the same origin under
 * their own prefixes, so each Experience gets isolated, independently-cacheable paths.
 * Each app's built `dist/` is deployed under its own prefix, and CloudFront error
 * responses fall back to E3's `index.html` so client-side (hash) routing survives a
 * hard refresh or deep link.
 */
export class HostingStack extends Stack {
  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);
    const env = props.appEnv;
    const isProd = env === 'pr';

    const bucket = new Bucket(this, 'web', {
      bucketName: resourceName('web', env),
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    const origin = S3BucketOrigin.withOriginAccessControl(bucket);

    // Directory-index rewriter. S3 behind OAC serves objects literally — unlike a website
    // endpoint it does NOT resolve `<prefix>/` to `<prefix>/index.html`, and
    // `defaultRootObject` only applies to the distribution root (`/`), not per-app
    // prefixes. Without this, `/e1` and `/e1/` request non-existent keys, 403, and get
    // swallowed by the global error fallback below → the wrong app is served. This viewer-
    // request function maps directory-style URIs to the app's index.html so each
    // Experience actually loads at its own path.
    const indexRewrite = new CloudFrontFunction(this, 'index-rewrite', {
      functionName: resourceName('web-index-rewrite', env),
      comment: 'Resolve <prefix>/ and extension-less paths to <prefix>/index.html',
      code: FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri === '/') { return request; } // defaultRootObject handles the root
  // /app is a marketing-friendly alias of the E1 organizer app. E1 is built with base /e1/
  // (assets resolve to /e1/*), so any /app document just needs the E1 shell; the URL stays /app.
  if (uri === '/app' || uri.indexOf('/app/') === 0) { request.uri = '/e1/index.html'; return request; }
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else {
    var seg = uri.substring(uri.lastIndexOf('/') + 1);
    if (seg.indexOf('.') === -1) { request.uri = uri + '/index.html'; }
  }
  return request;
}`),
    });

    const behaviour = {
      origin,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      functionAssociations: [{ function: indexRewrite, eventType: FunctionEventType.VIEWER_REQUEST }],
    };

    // Prod only: attach the custom apex domain + its us-east-1 ACM certificate. Staging keeps
    // the default *.cloudfront.net domain (domain left empty), so it stays fully functional.
    const useDomain = isProd && !!props.domain?.name && !!props.domain?.certificateArn;
    const certificate = useDomain ? Certificate.fromCertificateArn(this, 'cert', props.domain!.certificateArn) : undefined;

    const distribution = new Distribution(this, 'cdn', {
      comment: resourceName('web', env),
      // Root serves the marketing site; /app and /e3 resolve via the index-rewrite function.
      defaultRootObject: 'index.html',
      ...(useDomain ? { domainNames: [props.domain!.name], certificate } : {}),
      defaultBehavior: behaviour,
      additionalBehaviors: Object.fromEntries(APPS.map((a) => [`${a.prefix}/*`, behaviour])),
      // Last-resort fallback for genuinely missing objects. The index-rewrite function
      // above already resolves `/e1`, `/e1/`, `/e3`, `/e3/` to a real index.html, so this
      // no longer masks a whole app; it only catches truly-unknown paths (both apps are
      // hash-routed, so no server-side deep paths exist). Kept global — CloudFront error
      // responses are distribution-level, not per-behaviour.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    // Prod only: Route 53 apex A/AAAA aliases → CloudFront. Needs the hosted zone in this account.
    if (useDomain) {
      const zone = HostedZone.fromLookup(this, 'zone', { domainName: props.domain!.name });
      const target = RecordTarget.fromAlias(new CloudFrontTarget(distribution));
      new ARecord(this, 'apex-a', { zone, recordName: props.domain!.name, target });
      new AaaaRecord(this, 'apex-aaaa', { zone, recordName: props.domain!.name, target });
    }

    // Real built app bundles, one BucketDeployment per app, each under its own prefix.
    // Prerequisite: `apps/{e1,e3}-web/dist` must already exist at synth time — run
    // `npm run build -w @playfusion/e1-web -w @playfusion/e3-web` (or the Nx equivalent)
    // before `cdk synth`/`cdk deploy`, since Source.asset reads the built output on disk.
    //
    // `distribution` + `distributionPaths` make each deploy issue a CloudFront
    // invalidation. Without it, a new deploy uploads fresh hashed bundles to S3 but the
    // edge keeps serving the previously-cached index.html (which references the OLD
    // bundle) until TTL (up to 24h) — so a shipped fix silently doesn't reach users. Only
    // index.html needs busting (assets are content-hashed), but we invalidate the whole
    // prefix for safety; the root `/` (defaultRootObject → e3) is refreshed with e3.
    new BucketDeployment(this, 'e1', {
      destinationBucket: bucket,
      destinationKeyPrefix: 'e1',
      sources: [Source.asset(resolve(REPO, 'apps/e1-web/dist'))],
      distribution,
      distributionPaths: ['/e1/*'],
    });
    new BucketDeployment(this, 'e3', {
      destinationBucket: bucket,
      destinationKeyPrefix: 'e3',
      sources: [Source.asset(resolve(REPO, 'apps/e3-web/dist'))],
      distribution,
      distributionPaths: ['/e3/*'],
    });

    // Marketing site at the bucket ROOT. prune:false is critical — a root deploy with the default
    // prune would delete the e1/ and e3/ prefixes. Its assets live under /assets/* (no collision
    // with e1/e3, whose assets are under their own prefixes).
    new BucketDeployment(this, 'site', {
      destinationBucket: bucket,
      sources: [Source.asset(resolve(REPO, 'apps/site/dist'))],
      prune: false,
      distribution,
      distributionPaths: ['/', '/index.html', '/assets/*'],
    });
  }
}
