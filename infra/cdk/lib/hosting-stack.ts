import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { resourceName } from './naming.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..', '..');

export interface HostingStackProps extends StackProps {
  readonly appEnv: string;
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
    const behaviour = { origin, viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS };

    new Distribution(this, 'cdn', {
      comment: resourceName('web', env),
      defaultRootObject: 'e3/index.html',
      defaultBehavior: behaviour,
      additionalBehaviors: Object.fromEntries(APPS.map((a) => [`${a.prefix}/*`, behaviour])),
      // 403/404 → /e3/index.html assumes hash routing (the server only ever needs to
      // resolve /e1/ and /e3/, which exist); history/path-based routing inside an app
      // would need its own per-path fallback, not a single global one.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/e3/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/e3/index.html' },
      ],
    });

    // Real built app bundles, one BucketDeployment per app, each under its own prefix.
    // Prerequisite: `apps/{e1,e3}-web/dist` must already exist at synth time — run
    // `npm run build -w @playfusion/e1-web -w @playfusion/e3-web` (or the Nx equivalent)
    // before `cdk synth`/`cdk deploy`, since Source.asset reads the built output on disk.
    new BucketDeployment(this, 'e1', {
      destinationBucket: bucket,
      destinationKeyPrefix: 'e1',
      sources: [Source.asset(resolve(REPO, 'apps/e1-web/dist'))],
    });
    new BucketDeployment(this, 'e3', {
      destinationBucket: bucket,
      destinationKeyPrefix: 'e3',
      sources: [Source.asset(resolve(REPO, 'apps/e3-web/dist'))],
    });
  }
}
