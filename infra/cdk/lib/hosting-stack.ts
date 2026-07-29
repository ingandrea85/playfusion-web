import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { resourceName } from './naming.js';

export interface HostingStackProps extends StackProps {
  readonly appEnv: string;
}

// Path-based hosting per Experience (R7): each app is served from its own key prefix
// behind a dedicated CloudFront behaviour, off one S3 origin.
const APPS = [
  { name: 'e1', prefix: 'e1', title: 'E1 — Organizer' },
  { name: 'e3', prefix: 'e3', title: 'E3 — Public' },
];

const placeholder = (title: string): string =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<h1>${title}</h1><p>PlayFusion 2.0 — placeholder (S0.9).</p>`;

/**
 * S0.9 — S3 + CloudFront static hosting with path-based behaviours per Experience.
 * Default behaviour serves E3 (public); `e1/*` and `e3/*` route to the same origin under
 * their own prefixes, so each Experience gets isolated, independently-cacheable paths.
 * A placeholder index is deployed per app so a real deploy serves something per path.
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
    });

    // Placeholder index per app (inline, no Docker) — so a deploy serves a page per path.
    new BucketDeployment(this, 'placeholders', {
      destinationBucket: bucket,
      sources: APPS.map((a) => Source.data(`${a.prefix}/index.html`, placeholder(a.title))),
    });
  }
}
