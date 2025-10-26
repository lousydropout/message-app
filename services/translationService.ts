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

// Types for the translation system
export interface TranslationContext {
  messageId: string;
  language: string;
  content: string;
  history: Array<{
    userName: string;
    timestamp: number;
    content: string;
  }>;
  additional_context: Array<{
    userName: string;
    timestamp: number;
    content: string;
  }>;
  result?: {
    original_language: string;
    translated_text: string;
    cultural_notes: string;
  };
}

export interface CachedTranslation {
  messageId: string;
  language: string;
  translatedText: string;
  culturalNotes: string;
  originalLanguage: string;
  createdAt: number;
}

export interface TranslationResponse {
  type: "translation" | "tool_call";
  original_language?: string;
  translated_text?: string;
  cultural_notes?: string;
  search_terms?: Array<{
    term: string;
    variants: string[];
  }>;
  reason?: string;
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
    conversationHistory: Message[] = []
  ): Promise<CachedTranslation> {
    const messageId = message.id;

    // Check cache first
    const cached = await this.getCachedTranslation(messageId, language);
    if (cached) {
      logger.info("translation", "Cache hit for translation", {
        messageId,
        language,
      });
      return cached;
    }

    logger.info("translation", "Cache miss, starting LangGraph flow", {
      messageId,
      language,
    });

    // Prepare history from last 5 messages
    const preparedHistory = await this.prepareHistory(
      conversationHistory,
      message
    );

    // Create context object
    const ctx: TranslationContext = {
      messageId: message.id,
      language,
      content: message.text,
      history: preparedHistory,
      additional_context: [],
    };

    // Create MiniGraph with node functions
    const graph = new MiniGraph<TranslationContext>({
      entry: "translate",
      nodes: {
        translate: this.translateNode.bind(this),
        search: this.searchNode.bind(this),
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

    // Cache the result
    const translation: CachedTranslation = {
      messageId,
      language,
      translatedText: ctx.result.translated_text,
      culturalNotes: ctx.result.cultural_notes || "",
      originalLanguage: ctx.result.original_language,
      createdAt: Date.now(),
    };

    await this.cacheTranslation(translation);

    logger.info("translation", "Translation completed and cached", {
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
    input?: any
  ): Promise<{ next?: string; output?: any }> {
    // Determine mode: exploratory on first pass, execution on second pass
    const mode =
      ctx.additional_context.length > 0 ? "execution" : "exploratory";

    logger.info("translation", `Calling API with mode: ${mode}`, {
      messageId: ctx.messageId,
    });

    const response = await this.callTranslationAPI(ctx, mode);

    if (response.type === "tool_call") {
      logger.info("translation", "Tool call requested, proceeding to search", {
        searchTerms: response.search_terms?.length || 0,
      });
      return { next: "search", output: response };
    } else {
      logger.info("translation", "Direct translation completed");
      ctx.result = {
        original_language: response.original_language || "Unknown",
        translated_text: response.translated_text || "",
        cultural_notes: response.cultural_notes || "",
      };
      return { next: "done" };
    }
  }

  /**
   * Search node - performs FTS5 search and adds context
   */
  private async searchNode(
    ctx: TranslationContext,
    toolCallResponse: TranslationResponse
  ): Promise<{ next?: string; output?: any }> {
    if (!toolCallResponse.search_terms) {
      logger.warning("translation", "No search terms in tool call response");
      return { next: "done" };
    }

    logger.info("translation", "Performing FTS5 search", {
      messageId: ctx.messageId,
      searchTerms: toolCallResponse.search_terms.length,
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
  ): Promise<TranslationResponse> {
    if (!this.apiUrl) {
      throw new Error("Translation API not configured");
    }

    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("User not authenticated");
    }

    const idToken = await currentUser.getIdToken();

    const requestBody = {
      language: ctx.language,
      content: ctx.content,
      history: ctx.history,
      additional_context: ctx.additional_context,
      mode,
    };

    logger.info("translation", "Making API request", {
      messageId: ctx.messageId,
      mode,
      historyLength: ctx.history.length,
      contextLength: ctx.additional_context.length,
    });

    const response = await fetch(`${this.apiUrl}/translate`, {
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
    logger.info("translation", "API response received", {
      messageId: ctx.messageId,
      type: result.type,
    });

    return result;
  }

  /**
   * Perform FTS5 search for additional context
   */
  private async performFTS5Search(
    searchTerms: Array<{ term: string; variants: string[] }>,
    currentMessageId: string
  ): Promise<Array<{ userName: string; timestamp: number; content: string }>> {
    const results: Array<{
      userName: string;
      timestamp: number;
      content: string;
    }> = [];

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
  ): Promise<
    Array<{
      userName: string;
      timestamp: number;
      content: string;
    }>
  > {
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
}

export default new TranslationService();
