#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { resolve } from 'node:path';
import { ReserwayaFrontStack } from '../lib/reserwaya-front-stack';

const app = new cdk.App();

new ReserwayaFrontStack(app, 'ReserwayaFrontStack', {
  projectRoot: resolve(__dirname, '../../..'),
  backApiUrl: process.env.BACK_API_URL ?? 'https://8lsipmj4x4.execute-api.us-east-1.amazonaws.com',
  description:
    'ReservaYa Angular SSR front end: S3 static assets + Lambda (Lambda Web Adapter) behind CloudFront. Proxies /api to the ReservaYa backend.',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});

app.synth();