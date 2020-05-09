import * as cdk from '@aws-cdk/core';
import { Aws } from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';

/**
 * 1. dockerイメージのリポジトリは事前に手動で作成する
 * 2. GitHubリポジトリのアクセストークンを事前に手動で取得する
 */

export class EcrCiPipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const APP_NAME = this.node.tryGetContext('appName');

    // youn410/rails_ecs-rails_appレポジトリへのpushをトリガーとしてパイプラインが開始される
    const sourseOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: `${APP_NAME}-GitHub-source-action`,
      owner: 'youn410',
      repo: 'rails_ecs-rails_app',
      branch: 'master',
      oauthToken: cdk.SecretValue.plainText('oauth token'),
      trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
      output: sourseOutput
    });

    const dockerBuildProject = new codebuild.PipelineProject(this, `${APP_NAME}-docker-build-pipeline-project`, {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        privileged: true
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            "runtime-versions": {
              docker: 18
            }
          },
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              "$(aws ecr get-login --no-include-email --region $AWS_REGION)",
              'IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)'
            ]
          },
          build: {
            commands: [
              "echo Building the Docker image...",
              `docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .`
            ]
          },
          post_build: {
            commands: [
              `docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG`,
              `docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG`
            ]
          }
        }
      })
    });
    dockerBuildProject.addToRolePolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: [
          'ecr:GetAuthorizationToken',
        ]
      })
    );
    dockerBuildProject.addToRolePolicy(
      new iam.PolicyStatement({
        resources: [`arn:aws:ecr:${Aws.REGION}:${Aws.ACCOUNT_ID}:repository/${APP_NAME}/rails`],
        actions: [
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:BatchCheckLayerAvailability',
          'ecr:PutImage'
        ]
      })
    )
    const dockerBuildOutput = new codepipeline.Artifact();
    const dockerBuildAction = new codepipeline_actions.CodeBuildAction({
      actionName: `${APP_NAME}-docker-build-action`,
      project: dockerBuildProject,
      environmentVariables: {
        AWS_ACCOUNT_ID: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: Aws.ACCOUNT_ID
        },
        AWS_REGION: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: Aws.REGION
        },
        IMAGE_REPO_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: `${APP_NAME}/rails`
        }
      },
      input: sourseOutput,
      outputs: [dockerBuildOutput]
    })

    const pipeline = new codepipeline.Pipeline(this, 'CodePipeline', {
      pipelineName: 'ecr-ci-pipeline',
      stages: [
        {
          stageName: 'Source',
          actions: [
            sourceAction
          ]
        },
        {
          stageName: 'Build',
          actions: [
            dockerBuildAction
          ]
        },
        // {
        //   stageName: 'PrepareDeploy',
        //   actions: [

        //   ]
        // }
      ]
    });
  };
}
