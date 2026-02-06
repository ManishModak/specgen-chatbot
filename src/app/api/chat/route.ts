import { google } from "@ai-sdk/google";
import { streamText, embed } from "ai";
import { keywordSearch, vectorSearch, getAllProducts, formatProductsAsContext, optimizeResultsForQuery } from "@/lib/search";
import { parseBuildList, formatParsedBuild } from "@/lib/build-parser";
import { analyzeBuild, formatAnalysisAsContext } from "@/lib/build-analyzer";
import { Product } from "@/lib/products";
import { logger } from "@/lib/logger";

type ApiErrorKind =
    | "quota_exhausted"
    | "rate_limited"
    | "auth_error"
    | "model_error"
    | "network_error"
    | "unknown";

interface ApiErrorInfo {
    kind: ApiErrorKind;
    statusCode: number;
    message: string;
    retryable: boolean;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

function getErrorStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== "object") return undefined;
    const maybeAny = error as Record<string, unknown>;

    const statusCode = maybeAny.statusCode;
    if (typeof statusCode === "number") return statusCode;

    const response = maybeAny.response;
    if (response && typeof response === "object") {
        const responseStatus = (response as Record<string, unknown>).status;
        if (typeof responseStatus === "number") return responseStatus;
    }

    return undefined;
}

function classifyApiError(error: unknown): ApiErrorInfo {
    const message = getErrorMessage(error);
    const lowerMessage = message.toLowerCase();
    const statusCode = getErrorStatusCode(error);

    const quotaHit =
        lowerMessage.includes("resource_exhausted") ||
        lowerMessage.includes("quota") ||
        lowerMessage.includes("quota exceeded");

    if (quotaHit) {
        return {
            kind: "quota_exhausted",
            statusCode: 429,
            message,
            retryable: true,
        };
    }

    if (statusCode === 429 || lowerMessage.includes("rate limit") || lowerMessage.includes("too many requests")) {
        return {
            kind: "rate_limited",
            statusCode: 429,
            message,
            retryable: true,
        };
    }

    if (
        statusCode === 401 ||
        statusCode === 403 ||
        lowerMessage.includes("api key") ||
        lowerMessage.includes("permission denied") ||
        lowerMessage.includes("unauthorized")
    ) {
        return {
            kind: "auth_error",
            statusCode: 500,
            message,
            retryable: false,
        };
    }

    if (lowerMessage.includes("not found") || lowerMessage.includes("not supported for") || lowerMessage.includes("model")) {
        return {
            kind: "model_error",
            statusCode: 500,
            message,
            retryable: false,
        };
    }

    if (lowerMessage.includes("network") || lowerMessage.includes("fetch") || statusCode === 503 || statusCode === 504) {
        return {
            kind: "network_error",
            statusCode: 503,
            message,
            retryable: true,
        };
    }

    return {
        kind: "unknown",
        statusCode: 500,
        message,
        retryable: false,
    };
}

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

/**
 * Generate embedding for user query using Gemini
 */
async function embedQuery(query: string): Promise<number[] | null> {
    const modelCandidates = ["gemini-embedding-001", "text-embedding-004"];

    for (const modelName of modelCandidates) {
        try {
            const { embedding } = await embed({
                model: google.textEmbeddingModel(modelName),
                value: query,
            });

            logger.debug("RAG", "Embedding generation succeeded", {
                model: modelName,
                embedding_dims: embedding.length,
            });

            return embedding;
        } catch (error) {
            const info = classifyApiError(error);
            logger.warn("RAG", "Embedding model failed", {
                model: modelName,
                error: info.message,
                error_kind: info.kind,
                retryable: info.retryable,
            });
        }
    }

    logger.error("RAG", "All embedding models failed", {
        candidates: modelCandidates,
    });
    return null;
}

export async function POST(req: Request) {
    const { messages, mode } = await req.json();

    // Helper to extract text content from message (handles both content string and parts array)
    const getMessageContent = (m: any): string => {
        if (typeof m.content === 'string') {
            return m.content;
        }
        // Handle parts array format from useChat with UIMessageStream
        if (m.parts && Array.isArray(m.parts)) {
            return m.parts
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join('');
        }
        return '';
    };

    // Get the last user message
    const lastUserMessage = messages[messages.length - 1];
    const userQuery = getMessageContent(lastUserMessage);
    logger.logRequest(mode, messages, userQuery);

    // RAG Step 1: Generate query embedding and perform vector search
    let searchResults: Product[];
    const ragStart = Date.now();
    const queryEmbedding = await embedQuery(userQuery);

    if (queryEmbedding) {
        // Use semantic vector search
        searchResults = optimizeResultsForQuery(userQuery, vectorSearch(queryEmbedding, 16), 8);
        if (searchResults.length > 0) {
            logger.logRAG("vector", searchResults, Date.now() - ragStart, queryEmbedding.length);
        } else {
            logger.warn("RAG", "Vector search yielded no compatible results, using keyword fallback", {
                embedding_dims: queryEmbedding.length,
            });
            searchResults = keywordSearch(userQuery, 8);
            logger.logRAG("keyword", searchResults, Date.now() - ragStart);
        }
    } else {
        // Fallback to keyword search
        searchResults = keywordSearch(userQuery, 8);
        logger.logRAG("keyword", searchResults, Date.now() - ragStart);
    }

    // If no results, fallback to all products (since we only have 10)
    const finalContextProducts = searchResults.length > 0 ? searchResults : getAllProducts().slice(0, 10);
    logger.debug("RAG", "Final context products selected", {
        final_count: finalContextProducts.length,
        used_fallback_all_products: searchResults.length === 0,
    });

    const productContext = formatProductsAsContext(finalContextProducts);
    logger.debug("RAG", "Product context rendered", {
        context_size_chars: productContext.length,
    });

    // === ROAST MODE: Parse and Analyze Build ===
    let buildAnalysisContext = "";
    if (mode === "roast") {
        const parsedBuild = parseBuildList(userQuery);

        if (parsedBuild.components.length > 0) {
            const analysis = analyzeBuild(parsedBuild);
            buildAnalysisContext = `
BUILD ANALYSIS (Pre-computed by system):
${formatParsedBuild(parsedBuild)}

${formatAnalysisAsContext(analysis)}
`;

            logger.logRoastAnalysis(
                parsedBuild.components.length,
                analysis.overallScore,
                analysis.issues.length,
                buildAnalysisContext
            );
        } else {
            logger.info("ROAST", "No components detected in roast input", {
                user_query: userQuery,
            });
        }
    }

    // Build product reference list for visual display
    const productRefList = finalContextProducts.map(p =>
        `[[PRODUCT:${p.id}]] = ${p.name} @ ₹${p.price.toLocaleString('en-IN')} (${p.retailer})`
    ).join('\n');

    // Define System Prompt based on Mode
    const baseSystemPrompt = `# IDENTITY
You are **SpecGen**, an expert PC builder and hardware consultant specializing in the Indian market.
Your personality: helpful, witty, knowledgeable, and practical.

# KNOWLEDGE BOUNDARIES
- Your knowledge is LIMITED to the products provided in the CONTEXT section below.
- You have access to real-time pricing and stock data from Indian retailers (Flipkart, Amazon.in, MDComputers, etc.)
- Current date context: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}

# ACCURACY RULES (CRITICAL - FOLLOW STRICTLY)
1. **ONLY recommend products from the CONTEXT below.** Never invent or hallucinate products, prices, or specifications.
2. **Quote exact prices** as shown in the context. Do not estimate or round prices.
3. **If a product is not in the context**, explicitly tell the user: "I don't have that product in my current database."
4. **Never fabricate specifications.** Only mention specs that are explicitly provided in the context.
5. **Acknowledge uncertainty.** If unsure about compatibility or specs, say so clearly.

# RESPONSE FORMATTING
- Use Markdown formatting for readability.
- Use **bold** for product names.
- Use bullet points for lists.
- Keep responses concise but informative.

# PRODUCT DISPLAY SYSTEM (IMPORTANT!)
When recommending products, ALWAYS include the special tag [[PRODUCT:id]] to display visual product cards.
These tags are automatically replaced with clickable cards showing: image, price, retailer, and buy link.

## Available Products (Use these exact tags):
${productRefList}

## Example Usage:
"For your GPU, I recommend the **RTX 4060 Ti**! [[PRODUCT:flipkart-abc123]]"

# CONTEXT (Real-time Verified Prices from Indian Retailers):
${productContext}

# RESPONSE QUALITY CHECKLIST
Before responding, verify:
- [ ] All recommended products exist in the CONTEXT above
- [ ] All prices quoted are exact (not estimated)
- [ ] Product tags [[PRODUCT:id]] are included for visual display
- [ ] Response directly addresses the user's question
`;

    let modePrompt = "";
    if (mode === "roast") {
        modePrompt = `
# ACTIVE MODE: ROAST MASTER 🔥

## Your Persona
- Sarcastic, critical, entertaining, but ultimately helpful
- "Tough love" approach - roast them, then help them

## Your Task
The user has submitted a PC build for critique. Use the BUILD ANALYSIS section below which contains pre-computed compatibility issues.

## Response Structure (Follow This)
1. **Opening Roast** - A witty one-liner about their build
2. **Issue-by-Issue Breakdown** - For each issue:
   - Roast the mistake entertainingly
   - Explain WHY it's a problem (technical accuracy matters!)
   - Suggest a specific better alternative from your CONTEXT
   - Include [[PRODUCT:id]] tag for the recommended fix
3. **Final Verdict** - Overall score and encouragement

## Example Roasts (Use Similar Tone)
- "A 450W PSU with that GPU? Bold move. Hope you like the smell of burning electronics."
- "Socket mismatch? Did you just pick parts by vibes? Let me help you..."
- "CPU bottleneck detected. Your GPU is basically on vacation while your CPU sweats."

## Build Analysis Data:
${buildAnalysisContext}
`;
    } else {
        modePrompt = `
# ACTIVE MODE: PC ARCHITECT 🔨

## Your Persona
- Helpful, professional, knowledgeable guide
- Patient with beginners, detailed with enthusiasts

## Your Task
Help the user build or plan their PC. Prioritize their budget and use-case.

## Response Behavior
1. **Clarify if needed** - If budget or use-case is unclear, ask ONE specific question first
2. **Be specific** - Always mention exact product names and prices from CONTEXT
3. **Show products visually** - Include [[PRODUCT:id]] tags for every recommendation
4. **Explain decisions** - Tell them WHY each part was chosen
5. **Summarize costs** - End with a clear total price breakdown

## Response Structure for Build Recommendations
1. **Quick Acknowledgment** - What you understood from their request
2. **Component List** - Each part with:
   - Product name (bold)
   - Price (exact from CONTEXT)
   - Why you chose it
   - [[PRODUCT:id]] tag
3. **Compatibility Notes** - Any important considerations
4. **Total Cost Summary** - Itemized + grand total in ₹
`;
    }

    const systemPrompt = `${baseSystemPrompt}\n${modePrompt}`;
    logger.logSystemPrompt(systemPrompt, mode, finalContextProducts.length);

    // Check for API Key
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        logger.error("API", "Missing API key", {
            env_var: "GOOGLE_GENERATIVE_AI_API_KEY",
        });
        return new Response("Missing GOOGLE_GENERATIVE_AI_API_KEY in .env.local", { status: 500 });
    }
    logger.debug("API", "API key check passed", {
        env_var: "GOOGLE_GENERATIVE_AI_API_KEY",
    });

    try {
        const apiCallStart = Date.now();

        // Filter out messages with empty content
        const validMessages = messages
            .map((m: any) => ({
                role: m.role,
                content: getMessageContent(m)
            }))
            .filter((m: any) => m.content.length > 0);

        logger.logAPICallStart("gemini-2.5-flash", validMessages.length);
        logger.trace("API", "Valid messages payload", {
            messages: validMessages,
        });

        const result = streamText({
            model: google("gemini-2.5-flash"),
            messages: validMessages,
            system: systemPrompt,
            onFinish: ({ text, usage }) => {
                logger.logResponse(text, usage ?? {}, Date.now() - apiCallStart);
            }
        });

        logger.info("API", "Streaming response to client", {
            mode,
            session_id: logger.getSessionId(),
            log_file: logger.getLogFilePath(),
        });
        return result.toUIMessageStreamResponse();
    } catch (error) {
        const info = classifyApiError(error);
        logger.logError(error, "Gemini streamText call failed");
        logger.error("API", "Provider failure classified", {
            error_kind: info.kind,
            status_code: info.statusCode,
            retryable: info.retryable,
            message: info.message,
        });

        if (info.kind === "quota_exhausted" || info.kind === "rate_limited") {
            return new Response("AI service is temporarily rate-limited. Please retry in a minute.", { status: 429 });
        }

        if (info.kind === "auth_error") {
            return new Response("AI service authentication failed. Check server API key configuration.", { status: 500 });
        }

        return new Response("Error communicating with AI service.", { status: info.statusCode });
    }
}

