import { join } from 'node:path';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  PriceClass,
  ResponseHeadersPolicy,
  S3OriginAccessControl,
} from 'aws-cdk-lib/aws-cloudfront';
import {
  Architecture,
  DockerImageCode,
  DockerImageFunction,
  FunctionUrlAuthType,
} from 'aws-cdk-lib/aws-lambda';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface ReserwayaFrontStackProps extends StackProps {
  /**
   * Root of the Angular workspace. Must contain dist/reserwaya/{browser,server}
   * (i.e. run `npm run build` before deploying) and deploy/docker/Dockerfile.
   */
  projectRoot: string;
  /**
   * Base URL of the ReservaYa backend (API Gateway stage) the SSR Lambda
   * proxies `/api/*` to. Set to '' to skip wiring upstream (503 at runtime).
   */
  backApiUrl: string;
}

/**
 * ReservaYa front-end hosting:
 *  - S3 bucket with the immutable browser assets (JS/CSS/`/assets/*`) behind an
 *    Origin Access Control, cached at the edge.
 *  - Lambda (Docker image + Lambda Web Adapter) running the Angular SSR server;
 *    the Function URL is the default origin (never cached at the edge).
 *  - CloudFront routes static files to S3 and everything else to the SSR Lambda.
 */
export class ReserwayaFrontStack extends Stack {
  constructor(scope: Construct, id: string, props: ReserwayaFrontStackProps) {
    super(scope, id, props);

    // ---- Static assets ------------------------------------------------
    const assetsBucket = new Bucket(this, 'AssetsBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    new s3deploy.BucketDeployment(this, 'DeployBrowserAssets', {
      sources: [
        s3deploy.Source.asset(join(props.projectRoot, 'dist', 'reserwaya', 'browser')),
      ],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: '',
      prune: true,
    });

    const assetsOriginAccessControl = new S3OriginAccessControl(this, 'AssetsOac', {
      originAccessControlName: 'reserwaya-static-oac',
      description: 'CloudFront -> S3 (ReservaYa static assets)',
    });
    const s3AssetsOrigin = origins.S3BucketOrigin.withOriginAccessControl(
      assetsBucket,
      { originAccessControl: assetsOriginAccessControl },
    );
    const s3AssetsBehavior = {
      origin: s3AssetsOrigin,
      cachePolicy: CachePolicy.CACHING_OPTIMIZED,
    };

    // ---- SSR Lambda -----------------------------------------------------
    const ssrFunction = new DockerImageFunction(this, 'SsrFunction', {
      description: 'ReservaYa Angular SSR (Lambda Web Adapter)',
      code: DockerImageCode.fromImageAsset(props.projectRoot, {
        file: 'deploy/docker/Dockerfile',
      }),
      architecture: Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(60),
      environment: {
        NG_ALLOWED_HOSTS: '*',
        NG_TRUST_PROXY_HEADERS:
          'x-forwarded-for,x-forwarded-host,x-forwarded-proto,x-forwarded-port',
        BACK_API_URL: props.backApiUrl,
      },
    });

    const functionUrl = ssrFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    // SSR pages must never be cached at the edge.
    const noStorePolicy = new ResponseHeadersPolicy(this, 'SsrNoStorePolicy', {
      customHeadersBehavior: {
        customHeaders: [{ header: 'Cache-Control', value: 'no-store', override: true }],
      },
    });

    // ---- CloudFront -----------------------------------------------------
    const distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.FunctionUrlOrigin(functionUrl, {
          readTimeout: Duration.seconds(60),
        }),
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        responseHeadersPolicy: noStorePolicy,
      },
      additionalBehaviors: {
        '/*.js': s3AssetsBehavior,
        '/*.css': s3AssetsBehavior,
        '/assets/*': s3AssetsBehavior,
      },
      priceClass: PriceClass.PRICE_CLASS_100,
    });

    // ---- Outputs ---------------------------------------------------------
    new CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new CfnOutput(this, 'SsrFunctionUrl', {
      value: functionUrl.url,
    });
  }
}