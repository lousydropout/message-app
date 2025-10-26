# OpenAI Translation with Context Clues API Server

The goal of this server directory is to provide an API (via AWS Lambda) that lets users of the MessageAI app query translations to a text.

## Dependencies

- firebase-admin
- openai

## Installation

```bash
bun install
```

## Deployment

The following command assumes you have your AWS keys set up. To test if it's okay, run

```bash
aws s3 ls
```

It should list all of your AWS S3 buckets if your AWS keys have been set up properly.

Next, update the provided `.env.template` file and rename it as `.env`. See the "Environment variables" section for information on where to get those variables.

you just need to run the following command in this directory. That is, run in `server/`

```bash
cdk deploy
```

A result of this deployment is an URL. This URL is to be passed to your `.env` file in the top level (so that MessageAI knows the URL to call). If you forgot the value, run `cdk deploy` again and it'll show you the URL at the end.

## Environment variables for AWS Lambda

For the Firebase-related environment variables, go to your project's Firebase console. From there, click on the "⚙️" next to your project's name -> "Project settings" -> "Service accounts" -> "Firebase Admin SDK" -> "Generate new private key," which download a JSON document with the relevant Firebase-related environment variables.

For the OpenAI API key, grab from OpenAI.
