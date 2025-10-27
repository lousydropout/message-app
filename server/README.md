# MessageAI Translation API Server

A secure AWS Lambda-based API server that provides AI-powered translation services for the MessageAI messaging application. This server ensures API key security by keeping OpenAI credentials server-side while authenticating MessageAI users via Firebase Admin SDK.

## 🎯 Purpose

The API Server solves a critical security challenge: **protecting OpenAI API keys from client-side exposure**. Instead of embedding API keys in the MessageAI mobile app (which could be reverse-engineered), this server:

1. **Authenticates MessageAI users** using Firebase Admin SDK
2. **Securely queries OpenAI GPT-4.1-mini** for translations and cultural context
3. **Returns structured JSON responses** to the MessageAI app

## 🔐 Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURE API SERVER FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    MESSAGEAI APP                           │ │
│  │                                                            │ │
│  │  POST /translate                                           │ │
│  │  Headers: Authorization: Bearer <Firebase-ID-Token>        │ │
│  │  Body: { text, targetLanguage, sourceLanguage? }           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  AWS LAMBDA FUNCTION                       │ │
│  │                                                            │ │
│  │  1. Firebase Admin Authentication                          │ │
│  │     • Verify Firebase ID token                             │ │
│  │     • Confirm user is authenticated                        │ │
│  │     • Extract user ID from token                           │ │
│  │                                                            │ │
│  │  2. OpenAI API Integration                                 │ │
│  │     • Use secure server-side API key                       │ │
│  │     • Query GPT-4.1-mini for translation                    │ │
│  │     • Include cultural context and formality notes         │ │
│  │                                                            │ │
│  │  3. Response                                               │ │
│  │     • Return JSON with translation and context             │ │
│  │     • Log request for monitoring                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Features

### Core Functionality

- **Firebase Admin Authentication**: Verifies MessageAI user identity
- **OpenAI GPT-4.1-mini Integration**: High-quality translations with cultural context
- **Secure API Key Management**: OpenAI credentials stored server-side only
- **AWS Lambda Deployment**: Serverless, cost-effective, auto-scaling
- **Structured JSON Responses**: Consistent API format for MessageAI integration

### Translation Capabilities

- **Multi-language Support**: Translate between any supported languages
- **Cultural Context**: Provides cultural notes and formality guidance
- **Language Detection**: Automatic source language detection when not specified
- **Context-Aware**: Considers conversation context for better translations

## 📋 API Documentation

### Endpoint: `POST /translate`

Translates text and provides cultural context for MessageAI users.

#### Request

**Headers:**

```
Authorization: Bearer <Firebase-ID-Token>
Content-Type: application/json
```

**Body:**

```json
{
  "content": "こんにちは",
  "language": "en"
}
```

where "language" is what the user wishes "content" be translated into.

**Parameters:**

- `content` (string, required): Text to translate
- `language` (string, required): Target language code (ISO 639-1)

#### Response

**Success (200):**

```json
{
  original_text: "こんにちは"
  original_language: "ja",
  target_language: "en",
  translated_text: "Hello",
  cultural_notes: "Although こんにちは literally means \"Today is,\" it is used as a greeting, much like \"Hello\" in English.",
}
```

**Error (401 - Unauthorized):**

```json
{
  "success": false,
  "error": "Invalid or expired Firebase token",
  "code": "UNAUTHORIZED"
}
```

**Error (400 - Bad Request):**

```json
{
  "success": false,
  "error": "Missing required field: text",
  "code": "BAD_REQUEST"
}
```

**Error (500 - Server Error):**

```json
{
  "success": false,
  "error": "Translation service temporarily unavailable",
  "code": "SERVICE_ERROR"
}
```

## 🛠️ Setup & Deployment

### Prerequisites

- Node.js 18+ or Bun
- AWS CLI configured with appropriate permissions
- Firebase project with Admin SDK access
- OpenAI API account with GPT-4.1-mini access

### Installation

```bash
# Install dependencies
bun install
```

### Environment Configuration

1. **Copy the environment template:**

   ```bash
   cp .env.template .env
   ```

2. **Configure Firebase Admin SDK:**

   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key" to download JSON
   - Extract the following values to your `.env` file:

   ```bash
   # Firebase Admin SDK Configuration
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

   # OpenAI Configuration
   OPENAI_API_KEY=sk-your-openai-api-key-here
   ```

3. **Verify AWS Configuration:**
   ```bash
   aws s3 ls
   ```
   Should list your S3 buckets if AWS is configured correctly.

### Deployment

Deploy the API Server to AWS Lambda:

```bash
cdk deploy
```

**Important:** After deployment, you'll receive an API URL. Add this to your MessageAI app's `.env` file:

```bash
# In MessageAI root directory .env file
EXPO_PUBLIC_API_URL=https://your-api-gateway-url.amazonaws.com/prod
```

### Retrieving the API URL

If you need to retrieve the API URL later:

```bash
aws cloudformation describe-stacks --stack-name ServerStack --query 'Stacks[0].Outputs'
```

## 🔧 Development

### Local Testing

```bash
# Install dependencies
bun install
```

### Project Structure

```
server/
├── bin/
│   └── server.ts              # CDK app entry point
├── lib/
│   └── server-stack.ts        # AWS infrastructure definition
├── lambda/
│   └── index.ts               # Lambda function implementation
├── test/                      # Unit tests
├── cdk.json                   # CDK configuration
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

### Key Files

- **`lambda/index.ts`**: Main Lambda function handling translation requests
- **`lib/server-stack.ts`**: AWS CDK infrastructure (API Gateway + Lambda)
- **`bin/server.ts`**: CDK app configuration and deployment

## 🔒 Security Considerations

### API Key Protection

- **Never expose OpenAI API keys** in client-side code
- **Firebase Admin SDK** verifies user authentication server-side
- **HTTPS only** for all API communications
- **Environment variables** for sensitive configuration

### Authentication Flow

1. MessageAI app obtains Firebase ID token from authenticated user
2. App sends token in `Authorization` header with translation request
3. Lambda function verifies token using Firebase Admin SDK
4. Only authenticated MessageAI users can access translation services

### Rate Limiting & Monitoring

- **AWS API Gateway** provides built-in rate limiting
- **CloudWatch** logs all requests for monitoring
- **Error tracking** for failed authentication attempts

## 🚨 Troubleshooting

### Common Issues

**Deployment Failures:**

- Verify AWS credentials: `aws sts get-caller-identity`
- Check CDK version compatibility
- Ensure sufficient AWS permissions for Lambda and API Gateway

**Authentication Errors:**

- Verify Firebase Admin SDK configuration in `.env`
- Check that Firebase project ID matches your MessageAI app
- Ensure private key format includes `\n` characters

**OpenAI API Errors:**

- Verify OpenAI API key is valid and has sufficient credits
- Check API key permissions for GPT-4.1-mini access
- Monitor OpenAI usage limits and quotas

**API Gateway Issues:**

- Check CloudWatch logs for Lambda function errors
- Verify CORS configuration if testing from browser
- Ensure API Gateway is deployed to correct region

### Debugging

1. **Check Lambda logs:**

   ```bash
   aws logs describe-log-groups --log-group-name-prefix /aws/lambda/ServerStack
   ```

2. **Test API endpoint:**

   ```bash
   curl -X POST https://your-api-url/translate \
     -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"text":"Hello","targetLanguage":"es"}'
   ```

3. **Verify Firebase token:**
   Use Firebase Admin SDK to decode and verify tokens manually

## 📊 Monitoring & Analytics

### CloudWatch Metrics

- **Request count** and **error rates**
- **Response times** and **latency**
- **Authentication success/failure rates**

### Cost Optimization

- **Lambda cold starts** minimized with provisioned concurrency
- **API Gateway caching** for frequently requested translations
- **OpenAI token usage** monitoring to control costs

## 🔄 Integration with MessageAI

The API Server is designed to integrate seamlessly with MessageAI:

1. **MessageAI app** sends translation requests with Firebase ID tokens
2. **API Server** authenticates and processes requests
3. **Translation results** are returned in structured JSON format
4. **MessageAI** displays translations and cultural context to users

For MessageAI integration details, see the main [`README.md`](../README.md) in the project root.

## 📝 License

This API Server is part of the MessageAI project. See the main project license for details.
