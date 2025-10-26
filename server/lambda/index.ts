import * as admin from "firebase-admin";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import OpenAI from "openai";

/**
 * Firebase Admin initialization
 *
 * AWS Lambda runs outside of GCP, so we can't rely on applicationDefault().
 * We inject the service account credentials via environment variables or AWS Secrets Manager.
 *
 * Required env vars:
 *  - FIREBASE_PROJECT_ID
 *  - FIREBASE_CLIENT_EMAIL
 *  - FIREBASE_PRIVATE_KEY (escaped with \n for line breaks)
 *  - OPENAI_API_KEY
 */

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.error("Missing Firebase credentials in environment variables");
    throw new Error("Missing Firebase credentials");
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  console.log(`Firebase Admin initialized for project: ${projectId}`);
}

/**
 * OpenAI client initialization
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment variables");
  throw new Error("Missing OpenAI API key");
}

const app = new Hono();

/**
 * Authentication middleware
 * Verifies Firebase ID tokens and adds user info to context
 */
async function authMiddleware(c: any, next: any) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] Auth middleware started`);

  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log(
      `[${requestId}] Auth failed: Missing or invalid Authorization header`
    );
    return c.json(
      {
        error:
          "Missing or invalid Authorization header. Expected: Bearer <token>",
      },
      401
    );
  }

  const idToken = authHeader.substring(7);
  console.log(`[${requestId}] Token extracted, length: ${idToken.length}`);

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log(`[${requestId}] Token verified successfully:`, {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified,
    });
    c.set("user", decoded);
    await next();
  } catch (err) {
    console.error(`[${requestId}] Token verification failed:`, {
      error: err instanceof Error ? err.message : err,
    });
    return c.json(
      {
        error: "Invalid or expired Firebase ID token",
      },
      401
    );
  }
}

/**
 * Global CORS configuration
 * In production, restrict `origin` to your known frontend domains.
 */
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

/**
 * Root route — simple health check
 */
app.get("/", (c) => {
  return c.json({
    message: "Hono + Firebase Auth Lambda is running",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Auth check route
 * Verifies Firebase ID tokens from Expo/Firebase client apps.
 */
app.get("/auth/check", async (c) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      {
        authenticated: false,
        error:
          "Missing or invalid Authorization header. Expected: Bearer <token>",
      },
      401
    );
  }

  const idToken = authHeader.substring(7);

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);

    return c.json({
      authenticated: true,
      uid: decoded.uid,
      email: decoded.email || null,
      email_verified: decoded.email_verified || false,
      name: decoded.name || null,
      picture: decoded.picture || null,
      issued_at: new Date(decoded.iat * 1000).toISOString(),
      expires_at: new Date(decoded.exp * 1000).toISOString(),
    });
  } catch (err) {
    console.error("Token verification failed:", err);
    return c.json(
      {
        authenticated: false,
        error: "Invalid or expired Firebase ID token",
      },
      401
    );
  }
});

/**
 * Translation endpoint
 * POST /translate
 * Body: { language: string, content: string }
 * Requires authentication
 */
app.post("/translate", authMiddleware, async (c) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] Translation request started`);

  try {
    const body = await c.req.json();
    const { language, content } = body;

    console.log(`[${requestId}] Request body received:`, {
      language,
      contentLength: content?.length || 0,
      contentPreview:
        content?.substring(0, 100) + (content?.length > 100 ? "..." : ""),
    });

    // Validate request body
    if (!language || !content) {
      console.log(`[${requestId}] Validation failed: Missing required fields`);
      return c.json(
        {
          error:
            "Missing required fields. Expected: { language: string, content: string }",
        },
        400
      );
    }

    if (typeof language !== "string" || typeof content !== "string") {
      console.log(`[${requestId}] Validation failed: Invalid field types`, {
        languageType: typeof language,
        contentType: typeof content,
      });
      return c.json(
        {
          error:
            "Invalid field types. Both 'language' and 'content' must be strings.",
        },
        400
      );
    }

    if (content.trim().length === 0) {
      console.log(`[${requestId}] Validation failed: Empty content`);
      return c.json(
        {
          error: "Content cannot be empty.",
        },
        400
      );
    }

    console.log(
      `[${requestId}] Validation passed, proceeding with translation`
    );

    // Create translation prompt
    const prompt = `You are a professional translator. Please translate the following text to ${language}. 

First, detect the original language of the text and provide it in your response.
Then, provide the translation. 

Notes:
1. Add short cultural notes in curly braces inside the translation. Add longer in the "cultural_notes" field.
2. Maintain the original meaning and tone of the text.

Please respond with a JSON object in this exact format:
{
  "original_language": "detected language name",
  "translated_text": "translated text here",
  "cultural_notes": "cultural notes here"
}

Text to translate: 
\`\`\`
${content}
\`\`\`
`;

    console.log(`[${requestId}] Calling OpenAI API with model: gpt-4o-mini`);
    const startTime = Date.now();

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional translator. Always respond with valid JSON in the exact format requested.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const apiDuration = Date.now() - startTime;
    console.log(`[${requestId}] OpenAI API call completed in ${apiDuration}ms`);

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      console.log(`[${requestId}] OpenAI API returned empty response`);
      throw new Error("No response from OpenAI");
    }

    console.log(`[${requestId}] OpenAI response received:`, {
      responseLength: responseText.length,
      responsePreview:
        responseText.substring(0, 200) +
        (responseText.length > 200 ? "..." : ""),
    });

    // Parse OpenAI response
    let translationResult;
    try {
      translationResult = JSON.parse(responseText);
      console.log(`[${requestId}] Successfully parsed OpenAI response:`, {
        originalLanguage: translationResult.original_language,
        translatedTextLength: translationResult.translated_text?.length || 0,
        hasCulturalNotes: !!translationResult.cultural_notes,
      });
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse OpenAI response:`, {
        error: parseError,
        responseText: responseText,
      });
      throw new Error("Invalid response format from translation service");
    }

    // Validate OpenAI response structure
    if (
      !translationResult.original_language ||
      !translationResult.translated_text
    ) {
      console.log(`[${requestId}] Invalid response structure:`, {
        hasOriginalLanguage: !!translationResult.original_language,
        hasTranslatedText: !!translationResult.translated_text,
        responseKeys: Object.keys(translationResult),
      });
      throw new Error("Invalid response structure from translation service");
    }

    // Return the complete translation results
    const finalResult = {
      original_text: content,
      original_language: translationResult.original_language,
      target_language: language,
      translated_text: translationResult.translated_text,
      cultural_notes: translationResult.cultural_notes || null,
    };

    console.log(`[${requestId}] Translation completed successfully:`, {
      originalLanguage: finalResult.original_language,
      targetLanguage: finalResult.target_language,
      originalTextLength: finalResult.original_text.length,
      translatedTextLength: finalResult.translated_text.length,
      hasCulturalNotes: !!finalResult.cultural_notes,
    });

    return c.json(finalResult);
  } catch (error) {
    console.error(`[${requestId}] Translation error:`, {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        console.log(`[${requestId}] API key error detected`);
        return c.json(
          {
            error: "Translation service unavailable. Please try again later.",
          },
          503
        );
      }

      if (error.message.includes("rate limit")) {
        console.log(`[${requestId}] Rate limit error detected`);
        return c.json(
          {
            error:
              "Translation service is currently busy. Please try again later.",
          },
          429
        );
      }
    }

    console.log(`[${requestId}] Returning generic error response`);
    return c.json(
      {
        error: "Translation failed. Please try again.",
      },
      500
    );
  }
});

/**
 * 404 handler
 */
app.notFound((c) => c.json({ error: "Not Found" }, 404));

/**
 * Global error handler
 */
app.onError((err, c) => {
  console.error("Unhandled server error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

/**
 * Export the AWS Lambda handler
 */
export const handler = handle(app);

/**
 * Local development tip:
 *
 * You can run this locally with:
 *   bunx tsx src/index.ts
 * or
 *   tsx watch src/index.ts
 *
 * Make sure to create a `.env` with:
 *   FIREBASE_PROJECT_ID=your-project-id
 *   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc@your-project-id.iam.gserviceaccount.com
 *   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----\n"
 *   OPENAI_API_KEY=your-openai-api-key
 *
 * Then hit http://localhost:8787/auth/check with a Firebase ID token
 * using:
 *   Authorization: Bearer <token>
 */
