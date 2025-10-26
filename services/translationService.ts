/**
 * @fileoverview Translation Service - Enhanced translation with LangGraph orchestration
 *
 * Provides context-aware translation with caching, FTS5 search, and background prefetch.
 * Uses MiniGraph for orchestration: translate → search → translate → done
 */

import sqliteService from "@/services/sqliteService";
import { logger } from "@/stores/loggerStore";
import { Message } from "@/types/Message";
import { MiniGraph } from "@/utils/miniGraph";
import { getAuth } from "firebase/auth";

// -----------------------------------------------------------------------------
// 🔹 Types
// -----------------------------------------------------------------------------
export interface TranslationStatus {
  phase: "translating" | "searching" | "resubmitting" | "complete";
  message: string;
  searchTerms?: string[];
  reason?: string;
  progress?: { current: number; total: number };
}

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
  audience: string | null;
}

// Types for the translation system
export interface TranslationContext {
  messageId: string;
  language: string;
  content: string;
  history: ChatTurn[];
  additional_context: ChatTurn[];
  speaker: string;
  audience: string | null;
  result?: {
    original_language: string;
    translated_text: string;
    cultural_notes: string;
    references_earlier: boolean;
    reference_detail: string;
    confidence: number;
  };
}

export interface CachedTranslation {
  messageId: string;
  language: string;
  translatedText: string;
  culturalNotes: string;
  originalLanguage: string;
  createdAt: number;
  referencesEarlier?: boolean;
  referenceDetail?: string;
  confidence?: number;
}

class TranslationService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.EXPO_PUBLIC_API_URL || "";
    if (!this.apiUrl) {
      console.warn("TranslationService: API URL not configured");
    }
  }

  /**
   * Main translation method with LangGraph orchestration
   */
  async translateMessageWithGraph(
    message: Message,
    language: string,
    conversationHistory: Message[] = [],
    onStatusUpdate?: (status: TranslationStatus) => void,
    isGroupChat: boolean = false
  ): Promise<CachedTranslation> {
    const messageId = message.id;

    // CACHE DISABLED FOR TESTING - Always run LangGraph flow
    logger.info("translation", "Cache disabled - starting LangGraph flow", {
      messageId,
      language,
    });

    // Prepare history from last 5 messages
    const preparedHistory = await this.prepareHistory(
      conversationHistory,
      message
    );

    // Determine speaker and audience
    const speaker = await this.getSpeakerName(message.senderId);
    const audience = isGroupChat ? null : await this.getCurrentUserName();

    // Create context object
    const ctx: TranslationContext = {
      messageId: message.id,
      language,
      content: message.text,
      history: preparedHistory,
      additional_context: [],
      speaker,
      audience,
    };

    // Create MiniGraph with node functions
    const graph = new MiniGraph<TranslationContext>({
      entry: "translate",
      nodes: {
        translate: (ctx, input) =>
          this.translateNode(ctx, input, onStatusUpdate),
        search: (ctx, input) => this.searchNode(ctx, input, onStatusUpdate),
        done: this.doneNode.bind(this),
      },
      onTransition: (state, ctx) => {
        logger.info("translation", `MiniGraph transition → ${state}`, {
          messageId: ctx.messageId,
        });
      },
    });

    // Execute the graph
    await graph.run(ctx);

    if (!ctx.result) {
      throw new Error("Translation failed - no result from graph execution");
    }

    // Create translation result (cache disabled)
    const translation: CachedTranslation = {
      messageId,
      language,
      translatedText: ctx.result.translated_text,
      culturalNotes: ctx.result.cultural_notes || "",
      originalLanguage: ctx.result.original_language,
      createdAt: Date.now(),
      referencesEarlier: ctx.result.references_earlier,
      referenceDetail: ctx.result.reference_detail,
      confidence: ctx.result.confidence,
    };

    // CACHE DISABLED FOR TESTING - Skip cache storage
    // await this.cacheTranslation(translation);

    logger.info("translation", "Translation completed (cache disabled)", {
      messageId,
      language,
    });
    return translation;
  }

  /**
   * Translate node - calls API with exploratory or execution mode
   */
  private async translateNode(
    ctx: TranslationContext,
    input?: any,
    onStatusUpdate?: (status: TranslationStatus) => void
  ): Promise<{ next?: string; output?: any }> {
    // Determine mode: exploratory on first pass, execution on second pass
    const mode =
      ctx.additional_context.length > 0 ? "execution" : "exploratory";

    logger.info("translation", `Calling API with mode: ${mode}`, {
      messageId: ctx.messageId,
    });

    // Emit status update based on mode
    if (mode === "exploratory") {
      onStatusUpdate?.({
        phase: "translating",
        message: "Analyzing message...",
        progress: { current: 1, total: 3 },
      });
    } else {
      onStatusUpdate?.({
        phase: "resubmitting",
        message: "Translating with context...",
        progress: { current: 3, total: 3 },
      });
    }

    const response = await this.callTranslationAPI(ctx, mode);

    if (mode === "exploratory") {
      const exploratoryResponse = response as ExploratoryResponse;
      if (exploratoryResponse.type === "tool_call") {
        logger.info(
          "translation",
          "Tool call requested, proceeding to search",
          {
            searchTerms: exploratoryResponse.search_terms?.length || 0,
            referencesEarlier: exploratoryResponse.references_earlier,
            confidence: exploratoryResponse.confidence,
            reason: exploratoryResponse.reason,
          }
        );

        onStatusUpdate?.({
          phase: "searching",
          message: "Need more context",
          searchTerms: exploratoryResponse.search_terms?.map((s) => s.term),
          reason: exploratoryResponse.reason,
          progress: { current: 2, total: 3 },
        });

        return { next: "search", output: exploratoryResponse };
      } else {
        logger.info("translation", "Direct translation completed", {
          referencesEarlier: exploratoryResponse.references_earlier,
          confidence: exploratoryResponse.confidence,
        });

        onStatusUpdate?.({
          phase: "complete",
          message: "Translation complete!",
          progress: { current: 3, total: 3 },
        });

        ctx.result = {
          original_language: exploratoryResponse.original_language,
          translated_text: exploratoryResponse.translated_text,
          cultural_notes: exploratoryResponse.cultural_notes,
          references_earlier: exploratoryResponse.references_earlier,
          reference_detail: exploratoryResponse.reference_detail,
          confidence: exploratoryResponse.confidence,
        };
        return { next: "done" };
      }
    } else {
      const executionResponse = response as ExecutionResponse;
      logger.info("translation", "Execution translation completed", {
        referencesEarlier: executionResponse.references_earlier,
        confidence: executionResponse.confidence,
      });

      onStatusUpdate?.({
        phase: "complete",
        message: "Translation complete!",
        progress: { current: 3, total: 3 },
      });

      ctx.result = {
        original_language: executionResponse.original_language,
        translated_text: executionResponse.translated_text,
        cultural_notes: executionResponse.cultural_notes,
        references_earlier: executionResponse.references_earlier,
        reference_detail: executionResponse.reference_detail,
        confidence: executionResponse.confidence,
      };
      return { next: "done" };
    }
  }

  /**
   * Search node - performs FTS5 search and adds context
   */
  private async searchNode(
    ctx: TranslationContext,
    toolCallResponse: ToolCallResponse,
    onStatusUpdate?: (status: TranslationStatus) => void
  ): Promise<{ next?: string; output?: any }> {
    if (!toolCallResponse.search_terms) {
      logger.warning("translation", "No search terms in tool call response");
      return { next: "done" };
    }

    logger.info("translation", "Performing FTS5 search", {
      messageId: ctx.messageId,
      searchTerms: toolCallResponse.search_terms.length,
    });

    onStatusUpdate?.({
      phase: "searching",
      message: "Searching conversation history...",
      searchTerms: toolCallResponse.search_terms?.map((s) => s.term),
      progress: { current: 2, total: 3 },
    });

    const additionalContext = await this.performFTS5Search(
      toolCallResponse.search_terms,
      ctx.messageId
    );
    ctx.additional_context = additionalContext;

    logger.info("translation", "FTS5 search completed", {
      messageId: ctx.messageId,
      contextCount: additionalContext.length,
    });

    return { next: "translate" }; // Loop back to translate with additional context
  }

  /**
   * Done node - stops execution
   */
  private doneNode(ctx: TranslationContext): { next?: string; output?: any } {
    return {}; // Stops execution
  }

  /**
   * Call the translation API with different prompt modes
   */
  private async callTranslationAPI(
    ctx: TranslationContext,
    mode: "exploratory" | "execution"
  ): Promise<ExploratoryResponse | ExecutionResponse> {
    if (!this.apiUrl) {
      throw new Error("Translation API not configured");
    }

    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("User not authenticated");
    }

    const idToken = await currentUser.getIdToken();

    // Choose endpoint based on mode
    const endpoint =
      mode === "exploratory" ? "/translate/explore" : "/translate/execute";

    const requestBody: ExploratoryRequest | ExecutionRequest = {
      language: ctx.language,
      content: ctx.content,
      history: ctx.history,
      ...(mode === "execution" && {
        additional_context: ctx.additional_context,
        speaker: ctx.speaker,
        audience: ctx.audience,
      }),
    };

    logger.info("translation", "Making API request", {
      messageId: ctx.messageId,
      mode,
      endpoint,
      historyLength: ctx.history.length,
      contextLength: ctx.additional_context.length,
    });

    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status}`);
    }

    const result = await response.json();

    // Type-safe logging based on response type
    if (mode === "exploratory") {
      const exploratoryResult = result as ExploratoryResponse;
      logger.info("translation", "API response received", {
        messageId: ctx.messageId,
        type: exploratoryResult.type,
        referencesEarlier: exploratoryResult.references_earlier,
        confidence: exploratoryResult.confidence,
        referenceDetail:
          exploratoryResult.reference_detail?.substring(0, 100) +
          (exploratoryResult.reference_detail?.length > 100 ? "..." : ""),
      });
    } else {
      const executionResult = result as ExecutionResponse;
      logger.info("translation", "API response received", {
        messageId: ctx.messageId,
        referencesEarlier: executionResult.references_earlier,
        confidence: executionResult.confidence,
        referenceDetail:
          executionResult.reference_detail?.substring(0, 100) +
          (executionResult.reference_detail?.length > 100 ? "..." : ""),
      });
    }

    return result;
  }

  /**
   * Perform FTS5 search for additional context
   */
  private async performFTS5Search(
    searchTerms: Array<{ term: string; variants: string[] }>,
    currentMessageId: string
  ): Promise<ChatTurn[]> {
    const results: ChatTurn[] = [];

    try {
      // Ensure SQLite is initialized before searching
      await sqliteService.initialize();
    } catch (error) {
      logger.error(
        "translation",
        "Failed to initialize SQLite for FTS5 search",
        error
      );
      return [];
    }

    for (const { term, variants } of searchTerms) {
      const allTerms = [term, ...(variants || [])];

      for (const searchTerm of allTerms) {
        try {
          // Use existing FTS5 search functionality
          const searchResults = await sqliteService.searchMessages(
            searchTerm,
            undefined,
            10
          );

          for (const result of searchResults) {
            // Skip the current message
            if (result.id === currentMessageId) continue;

            // Get sender info for display
            const sender = await sqliteService.getUserProfile(result.senderId);
            const userName = sender?.displayName || "Unknown";

            results.push({
              userName,
              timestamp: result.timestamp,
              content: result.text,
            });
          }
        } catch (error) {
          logger.warning("translation", "FTS5 search failed for term", {
            term: searchTerm,
            error,
          });
        }
      }
    }

    // Deduplicate by messageId and sort by timestamp
    const uniqueResults = results.reduce((acc, current) => {
      const key = `${current.userName}-${current.timestamp}-${current.content}`;
      if (!acc.has(key)) {
        acc.set(key, current);
      }
      return acc;
    }, new Map());

    return Array.from(uniqueResults.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5); // Limit to 5 most relevant results
  }

  /**
   * Prepare conversation history for translation context
   */
  private async prepareHistory(
    conversationHistory: Message[],
    currentMessage: Message
  ): Promise<ChatTurn[]> {
    // Get recent messages (last 5) before current message
    const recentMessages = conversationHistory
      .filter(
        (msg) => msg.timestamp.toMillis() < currentMessage.timestamp.toMillis()
      )
      .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())
      .slice(0, 5);

    const history = [];
    for (const msg of recentMessages) {
      const sender = await sqliteService.getUserProfile(msg.senderId);
      history.push({
        userName: sender?.displayName || "Unknown",
        timestamp: msg.timestamp.toMillis(),
        content: msg.text,
      });
    }

    return history;
  }

  /**
   * Cache translation result
   */
  private async cacheTranslation(
    translation: CachedTranslation
  ): Promise<void> {
    try {
      // Ensure SQLite is initialized before caching
      await sqliteService.initialize();
      await sqliteService.cacheTranslation(translation);

      logger.info("translation", "Translation cached", {
        messageId: translation.messageId,
        language: translation.language,
      });
    } catch (error) {
      logger.error("translation", "Failed to cache translation", error);
      // Don't throw - caching failure shouldn't break translation
    }
  }

  /**
   * Get cached translation
   */
  private async getCachedTranslation(
    messageId: string,
    language: string
  ): Promise<CachedTranslation | null> {
    try {
      // Ensure SQLite is initialized before querying
      await sqliteService.initialize();
      const result = await sqliteService.getCachedTranslation(
        messageId,
        language
      );
      return result;
    } catch (error) {
      logger.warning("translation", "Failed to get cached translation", error);
      return null;
    }
  }

  /**
   * Get speaker name from user ID
   */
  private async getSpeakerName(senderId: string): Promise<string> {
    try {
      const user = await sqliteService.getUserProfile(senderId);
      return user?.displayName || "Unknown";
    } catch (error) {
      logger.warning("translation", "Failed to get speaker name", error);
      return "Unknown";
    }
  }

  /**
   * Get current user's display name
   */
  private async getCurrentUserName(): Promise<string> {
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return "You";
      }

      const user = await sqliteService.getUserProfile(currentUser.uid);
      return user?.displayName || "You";
    } catch (error) {
      logger.warning("translation", "Failed to get current user name", error);
      return "You";
    }
  }
}

export default new TranslationService();
