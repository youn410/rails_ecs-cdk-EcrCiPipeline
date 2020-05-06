#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { EcrCiPipelineStack } from '../lib/ecr_ci_pipeline-stack';

const app = new cdk.App();
new EcrCiPipelineStack(app, 'EcrCiPipelineStack');
