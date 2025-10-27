import * as admin from "firebase-admin";
import { Context, Hono, Next } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import OpenAI from "openai";

// -----------------------------------------------------------------------------
// 🔹 Types
// -----------------------------------------------------------------------------
interface TranslationResponse {
  type: "translation";
  original_language: string;
  translated_text: string;
  cultural_notes: string;
  references_earlier: boolean;
  reference_detail: string;
  confidence: number;
}

interface ToolCallResponse {
  type: "tool_call";
  search_terms: Array<{ term: string; variants: string[] }>;
  reason: string;
  references_earlier: boolean;
  reference_detail: string;
  confidence: number;
}

type ExploratoryResponse = TranslationResponse | ToolCallResponse;

interface ExecutionResponse {
  original_language: string;
  translated_text: string;
  cultural_notes: string;
  references_earlier: boolean;
  reference_detail: string;
  confidence: number;
}

interface ChatTurn {
  userName: string;
  timestamp: number;
  content: string;
}

interface ExploratoryRequest {
  language: string;
  content: string;
  history: ChatTurn[];
}

interface ExecutionRequest extends ExploratoryRequest {
  additional_context: ChatTurn[];
  speaker: string;
  audience: string;
}

// -----------------------------------------------------------------------------
// 🔹 Firebase Admin initialization
// -----------------------------------------------------------------------------
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey)
    throw new Error("Missing Firebase credentials");

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  console.log(`Firebase Admin initialized for project: ${projectId}`);
}

// -----------------------------------------------------------------------------
// 🔹 OpenAI client
// -----------------------------------------------------------------------------
if (!process.env.OPENAI_API_KEY)
  throw new Error("Missing OPENAI_API_KEY in environment variables");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -----------------------------------------------------------------------------
// 🔹 Helper utilities
// -----------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callOpenAIWithRetry(
  params: Parameters<typeof openai.chat.completions.create>[0]
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await openai.chat.completions.create(params);
    } catch (err: any) {
      if (err.status === 429 || err.code === "rate_limit_exceeded") {
        console.warn(`Rate limit hit (attempt ${attempt + 1}), retrying...`);
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed after retries");
}

function parseJSONResponse(responseText: string) {
  const clean = responseText.replace(/```json\s*|```/g, "").trim();
  return JSON.parse(clean);
}

function buildHistoryText(history: ChatTurn[]) {
  return history.map((h) => `[${h.userName}]: ${h.content}`).join("\n");
}

function buildPromptA(historyText: string, content: string) {
  return `You are a professional translator assisting in chat translation.

Goal:
Translate the most recent message while maintaining tone, nuance, and cultural context.
If you are not almost completely certain (≈95% confidence) that you have every necessary
contextual clue, you must request additional context from the client.

Reasoning guidance:
- Many chat messages depend on earlier references, inside jokes, or implied subjects.
- Unless you are >95% sure you fully understand the intended meaning, tone, and referents,
  assume you need more context.
- If you suspect that the message refers to something earlier, mark this explicitly and
  describe what it appears to reference and why it seems ambiguous.
- Always analyze what specific words, phrases, or concepts might be referencing earlier content.
- Explain the reasoning behind why additional context would be helpful.

When you decide to request more context, prefer issuing a "tool_call" with search terms.
Each search term should include likely spelling, script, or transliteration variants.
Example: for "kusa", include ["草", "くさ", "クサ", "www", "ｗｗｗ"].

Respond with valid JSON in one of these two forms:

If translation is ready and you are >95% confident:
{
  "type": "translation",
  "original_language": "detected language name",
  "translated_text": "translated text here",
  "cultural_notes": "cultural notes here",
  "references_earlier": true|false,
  "reference_detail": "analysis of referenced words/phrases or or 'no references detected'",
  "confidence": 0-100
}

If you need more information:
{
  "type": "tool_call",
  "search_terms": [
    { "term": "base term", "variants": ["variant1", "variant2", ...] },
    ...
  ],
  "reason": "why additional context would help",
  "references_earlier": true|false,
  "reference_detail": "analysis of ambiguous references",
  "confidence": 0-100
}

History:
${historyText}

Message to translate:
${content}`;
}

function buildPromptB(
  historyText: string,
  retrievedText: string,
  content: string,
  targetLanguage: string,
  speaker: string,
  audience: string | null
) {
  return `You are a professional translator. The user's preferred output language is ${targetLanguage}.
Always translate *into* ${targetLanguage}, even if the message is already written in that language.
If the message is already in ${targetLanguage}, reproduce it unchanged but still provide accurate cultural notes.

Context:
- The person who wrote the message is ${speaker}.
${
  audience
    ? `- The message is addressed to ${audience}. Write explanations as if speaking to ${audience}, using friendly second-person phrasing like “${speaker} is replying to your earlier message.”`
    : `- The message was sent in a group conversation. Use neutral third-person phrasing, referring to participants by name (e.g., “${speaker} is replying to Alice’s earlier question”).`
}

Task:
Translate the final message using both "history" and "additional_context" to capture tone,
slang, and cultural nuance.

Guidelines:
- The translation and cultural notes must both be written in ${targetLanguage}.
- Preserve tone and informality that reflects ${speaker}'s personality.
- If no specific audience is known, stay neutral and refer to users by name.
- Do NOT invent relationships or emotions not supported by the text.

Respond strictly with:
{
  "original_language": "detected language name",
  "translated_text": "translated text here in ${targetLanguage}",
  "cultural_notes": "brief explanatory notes written in ${targetLanguage}",
  "references_earlier": true|false,
  "reference_detail": "natural-language explanation (in ${targetLanguage}) of what earlier message ${speaker} is referencing. Address ${
    audience ?? "the reader"
  } appropriately.",
  "confidence": 0-100
}

History:
${historyText}

Additional context:
${retrievedText}

Message from ${speaker}:
${content}

`;
}

// -----------------------------------------------------------------------------
// 🔹 Hono app setup
// -----------------------------------------------------------------------------
const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*", // TODO: restrict in production
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// -----------------------------------------------------------------------------
// 🔹 Auth middleware
// -----------------------------------------------------------------------------
async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer "))
    return c.json({ error: "Missing or invalid Authorization header" }, 401);

  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
    c.set("user", decoded);
    return await next();
  } catch {
    return c.json({ error: "Invalid or expired Firebase ID token" }, 401);
  }
}

// -----------------------------------------------------------------------------
// 🔹 Routes
// -----------------------------------------------------------------------------
app.get("/", (c) =>
  c.json({
    message: "Hono + Firebase Auth Lambda is running",
    ts: new Date().toISOString(),
  })
);

// ---- Exploratory endpoint (Prompt A) ----
app.post("/translate/explore", authMiddleware, async (c) => {
  const id = crypto.randomUUID();
  try {
    const body = (await c.req.json()) as ExploratoryRequest;
    console.log(`[${id}] Request body:`, JSON.stringify(body, null, 2));
    const { language, content, history = [] } = body;
    if (!language || !content?.trim())
      return c.json({ error: "Missing fields" }, 400);

    const prompt = buildPromptA(buildHistoryText(history), content);
    const completion = (await callOpenAIWithRetry({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional translator. Always return valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
    })) as OpenAI.Chat.Completions.ChatCompletion;

    const raw = completion.choices[0]?.message?.content ?? "";
    const result = parseJSONResponse(raw) as ExploratoryResponse;

    // Validate essential fields
    if (
      result.type === "translation" &&
      (!result.translated_text || result.confidence == null)
    )
      throw new Error("Invalid translation result");
    if (result.type === "tool_call" && !Array.isArray(result.search_terms))
      throw new Error("Invalid tool_call result");

    if (process.env.NODE_ENV !== "production")
      console.log(`[${id}] Result:`, JSON.stringify(result, null, 2));

    return c.json(result);
  } catch (err: any) {
    console.error(`[${id}] Explore error:`, err);
    return c.json({ error: "Translation failed" }, 500);
  }
});

// ---- Execution endpoint (Prompt B) ----
app.post("/translate/execute", authMiddleware, async (c) => {
  const id = crypto.randomUUID();
  try {
    const body = (await c.req.json()) as ExecutionRequest;
    console.log(`[${id}] Request body:`, JSON.stringify(body, null, 2));
    const {
      language,
      content,
      history = [],
      additional_context = [],
      speaker,
      audience,
    } = body;
    if (!language || !content?.trim() || !speaker)
      return c.json({ error: "Missing fields" }, 400);

    const prompt = buildPromptB(
      buildHistoryText(history),
      buildHistoryText(additional_context),
      content,
      language,
      speaker,
      audience
    );

    const completion = (await callOpenAIWithRetry({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional translator. Always return valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
    })) as OpenAI.Chat.Completions.ChatCompletion;

    const raw = completion.choices[0]?.message?.content ?? "";
    const result = parseJSONResponse(raw) as ExecutionResponse;

    if (!result.translated_text || result.confidence == null)
      throw new Error("Invalid execution result");

    if (process.env.NODE_ENV !== "production")
      console.log(`[${id}] Exec result:`, JSON.stringify(result, null, 2));

    return c.json(result);
  } catch (err: any) {
    console.error(`[${id}] Execute error:`, err);
    return c.json({ error: "Translation failed" }, 500);
  }
});

// -----------------------------------------------------------------------------
// 🔹 404 + error handlers
// -----------------------------------------------------------------------------
app.notFound((c) => c.json({ error: "Not Found" }, 404));
app.onError((err, c) => {
  console.error("Unhandled server error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// -----------------------------------------------------------------------------
// 🔹 Export AWS Lambda handler
// -----------------------------------------------------------------------------
export const handler = handle(app);
