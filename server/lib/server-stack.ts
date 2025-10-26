import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export class ServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const fn = new NodejsFunction(this, "lambda", {
      functionName: "vincent-api-server",
      entry: "lambda/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID!,
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL!,
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY!,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
    });

    // Add tags to the function
    cdk.Tags.of(fn).add("Project", "VincentApp");
    cdk.Tags.of(fn).add("Environment", "Production");
    cdk.Tags.of(fn).add("Owner", "Vincent");

    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
    new cdk.CfnOutput(this, "lambdaUrl", {
      value: fnUrl.url!,
    });
  }
}
