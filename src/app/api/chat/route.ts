import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, embed } from "ai";
import { keywordSearch, vectorSearch, getAllProducts, formatProductsAsContext, optimizeResultsForQuery } from "@/lib/search";
import { parseBuildList, formatParsedBuild } from "@/lib/build-parser";
import { analyzeBuild, formatAnalysisAsContext } from "@/lib/build-analyzer";
import { generateRoastSuggestions, formatRoastAsContext } from "@/lib/roast-suggestions";
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

let apiKeyCursor = 0;

function getApiKeys(): string[] {
    const keysFromList = (process.env.GOOGLE_GENERATIVE_AI_API_KEYS || "")
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean);

    const singleKey = (process.env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
    const all = [...keysFromList, ...(singleKey ? [singleKey] : [])];
    return Array.from(new Set(all));
}

function maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) return "****";
    return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function getOrderedApiKeys(): string[] {
    const keys = getApiKeys();
    if (keys.length <= 1) return keys;

    const startIndex = apiKeyCursor % keys.length;
    apiKeyCursor += 1;

    return keys.slice(startIndex).concat(keys.slice(0, startIndex));
}

function embeddingFingerprint(vector: number[]): string {
    const preview = vector.slice(0, 12).map((v) => v.toFixed(6)).join("|");
    let hash = 0;
    for (let i = 0; i < preview.length; i++) {
        hash = (hash * 31 + preview.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
}

async function embedWithOllama(query: string): Promise<number[] | null> {
    const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
    const model = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

    try {
        const response = await fetch(`${baseUrl}/api/embeddings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt: query }),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Ollama embeddings failed (${response.status}): ${body}`);
        }

        const payload = await response.json() as { embedding?: number[] };
        const embedding = payload.embedding;
        if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
            throw new Error("Ollama returned empty embedding");
        }

        logger.debug("RAG", "Ollama embedding generation succeeded", {
            provider: "ollama",
            model,
            embedding_dims: embedding.length,
            base_url: baseUrl,
        });

        logger.trace("RAG", "Query embedding payload", {
            provider: "ollama",
            model,
            query,
            embedding_dims: embedding.length,
            embedding_preview: embedding.slice(0, 16),
            embedding_fingerprint: embeddingFingerprint(embedding),
        });

        return embedding;
    } catch (error) {
        logger.logError(error, "Ollama embedding generation failed");
        return null;
    }
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
async function embedQuery(query: string, apiKeys: string[]): Promise<number[] | null> {
    const provider = (process.env.EMBED_PROVIDER || "ollama").toLowerCase();
    if (provider === "ollama") {
        return embedWithOllama(query);
    }

    const modelCandidates = ["gemini-embedding-001", "text-embedding-004"] as const;

    for (const modelName of modelCandidates) {
        for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
            const apiKey = apiKeys[keyIndex];
            const provider = createGoogleGenerativeAI({ apiKey });

            try {
                const { embedding } = await embed({
                    model: provider.textEmbeddingModel(modelName),
                    value: query,
                });

                logger.debug("RAG", "Embedding generation succeeded", {
                    model: modelName,
                    embedding_dims: embedding.length,
                    api_key: maskApiKey(apiKey),
                    api_key_index: keyIndex,
                });

                logger.trace("RAG", "Query embedding payload", {
                    model: modelName,
                    query,
                    embedding_dims: embedding.length,
                    embedding_preview: embedding.slice(0, 16),
                    embedding_fingerprint: embeddingFingerprint(embedding),
                    api_key: maskApiKey(apiKey),
                });

                return embedding;
            } catch (error) {
                const info = classifyApiError(error);
                logger.warn("RAG", "Embedding model failed", {
                    model: modelName,
                    error: info.message,
                    error_kind: info.kind,
                    retryable: info.retryable,
                    api_key: maskApiKey(apiKey),
                    api_key_index: keyIndex,
                });

                const hasNextKey = keyIndex < apiKeys.length - 1;
                const canSwitchKey = info.kind === "quota_exhausted" || info.kind === "rate_limited" || info.kind === "network_error";
                if (!canSwitchKey || !hasNextKey) {
                    break;
                }
            }
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

    const orderedApiKeys = getOrderedApiKeys();
    if (orderedApiKeys.length === 0) {
        logger.error("API", "Missing API key", {
            env_var: "GOOGLE_GENERATIVE_AI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEYS",
        });
        return new Response("Missing GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEYS in .env.local", { status: 500 });
    }
    logger.info("API", "API key pool loaded", {
        keys_count: orderedApiKeys.length,
        keys: orderedApiKeys.map(maskApiKey),
    });

    // RAG Step 1: Generate query embedding and perform vector search
    let searchResults: Product[];
    const ragStart = Date.now();
    const queryEmbedding = await embedQuery(userQuery, orderedApiKeys);

    if (queryEmbedding) {
        // Use semantic vector search
        searchResults = optimizeResultsForQuery(userQuery, vectorSearch(queryEmbedding, 150, userQuery), 80);
        if (searchResults.length > 0) {
            logger.logRAG("vector", searchResults, Date.now() - ragStart, queryEmbedding.length);
        } else {
            logger.warn("RAG", "Vector search yielded no compatible results, using keyword fallback", {
                embedding_dims: queryEmbedding.length,
            });
            searchResults = keywordSearch(userQuery, 80);
            logger.logRAG("keyword", searchResults, Date.now() - ragStart);
        }
    } else {
        // Fallback to keyword search
        searchResults = keywordSearch(userQuery, 80);
        logger.logRAG("keyword", searchResults, Date.now() - ragStart);
    }

    // If no results, fallback to all products (increased for 3-tier build options)
    const finalContextProducts = searchResults.length > 0 ? searchResults : getAllProducts().slice(0, 100);
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
            const roastResult = generateRoastSuggestions(analysis, parsedBuild);

            buildAnalysisContext = `
BUILD ANALYSIS (Pre-computed by system):
${formatParsedBuild(parsedBuild)}

${formatAnalysisAsContext(analysis)}

${formatRoastAsContext(roastResult)}
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

## CLARIFYING QUESTIONS (CRITICAL - ASK FIRST WHEN QUERY IS VAGUE)

**DO NOT generate builds immediately if ANY of these are unclear:**
1. **Primary use case** - Gaming? Content creation? Programming? Office work?
2. **Performance expectations** - What games/software? What resolution/FPS target?
3. **Aesthetic preferences** - RGB? Minimalist? White theme? Size preference (ITX vs ATX)?
4. **Existing components** - Already have monitor/keyboard/mouse? Reusing any parts?
5. **Location constraints** - Buying from specific city/retailer? Need delivery?

**When to ask vs when to build:**
- **Ask 1-2 questions:** "80k build" (no use case mentioned)
- **Ask 3-4 questions:** "Gaming PC" (no budget or performance target)
- **Build immediately:** "₹80k gaming PC for 1080p high settings" (specific enough)

**Question format (RESPOND WITH THIS EXACT FORMAT):**

I'd love to help you build the perfect PC! Before I create your builds, I need to understand a few things:

1. **What's your main use case?** (Gaming, video editing, programming, etc.)
2. **What performance are you expecting?** (e.g., "Play GTA 6 at 1080p 60fps", "Cyberpunk 2077 ultra settings")
3. **Any aesthetic preferences?** (RGB lights, all-white build, compact size, etc.)
4. **Do you need everything included?** (Monitor, keyboard, mouse, or just the PC tower?)

Once you answer these, I'll create 3 tailored builds for you!

## 3-TIER BUILD SYSTEM (USE WHEN USER PROVIDES BUDGET WITH SPECIFIC FOCUS)

When user asks for a build with a budget AND has clarified use case (e.g., "₹80k gaming build for 1080p"), you MUST provide THREE build options:

### Build 1: Bang for Buck 💰
**Philosophy:** Maximum gaming performance per rupee
**Strategy:** 
- Allocate 40-45% of budget to GPU (best GPU you can afford without bottlenecking)
- Use reliable but basic components for everything else
- Target 1080p high settings gaming
- **Always stay under budget** (leave ₹2-3k buffer if possible)

### Build 2: Balanced Build ⚖️
**Philosophy:** Well-rounded, no weak links
**Strategy:**
- Even distribution across components
- Quality PSU with good efficiency
- Adequate cooling and case airflow
- Reliable motherboard with necessary features
- **Always stay under budget** (leave ₹2-3k buffer if possible)

### Build 3: Future-Ready 🚀
**Philosophy:** Platform for future upgrades
**Strategy:**
- Better motherboard (PCIe 4.0/5.0 support, more RAM slots, better VRMs)
- Higher wattage PSU (750W+ for GPU upgrades)
- DDR5 RAM if motherboard supports it
- Case with good airflow and expansion room
- **Can use buffer if significant performance/stability gain**, but indicate this clearly
- If over budget, provide downgrade options to meet budget

## RESPONSE STRUCTURE FOR BUDGET BUILDS

\`\`\`
## Build 1: Bang for Buck 💰

### Component List
| Component | Product | Price | Why |
|-----------|---------|-------|-----|
| CPU | **[Product Name]** [[PRODUCT:id]] | ₹XX,XXX | Reason |
| GPU | **[Product Name]** [[PRODUCT:id]] | ₹XX,XXX | Reason |
| Motherboard | **[Product Name]]** [[PRODUCT:id]] | ₹XX,XXX | Reason |
| RAM | **[Product Name]** [[PRODUCT:id]] | ₹XX,XXX | Reason |
| Storage | **[Product Name]** [[PRODUCT:id]] | ₹XX,XXX | Reason |
| PSU | **[Product Name]** [[PRODUCT:id]] | ₹XX,XXX | Reason |
| Case | **[Product Name]** [[PRODUCT:id]] | ₹XX,XXX | Reason |
| Cooler | **[Product Name]** [[PRODUCT:id]] | ₹XX,XXX | Reason (if not stock) |

**Total: ₹XX,XXX** ✅ ₹Y,XXX under budget (includes ₹2-3k buffer for shipping/build costs)

### 📉 Budget Downgrade Options
1. **Save ₹Z,XXX:** Downgrade GPU from [Current GPU] to [Cheaper GPU] [[PRODUCT:id]] - lose ~15% performance
2. **Save ₹Z,XXX:** Use stock cooler instead of [Current Cooler] [[PRODUCT:id]] - minimal impact
3. **Save ₹Z,XXX:** Reduce RAM from 16GB to 8GB [[PRODUCT:id]] - fine for pure gaming only

### 📈 Next Big Upgrade Options
1. **Upgrade to [Better GPU] [[PRODUCT:id]] for +₹Z,XXX** → ~35% better FPS (New total: ₹XX,XXX)
2. **Add 1TB SSD [[PRODUCT:id]] for +₹Z,XXX** → More game storage (New total: ₹XX,XXX)
3. **Upgrade PSU to [Higher Wattage] [[PRODUCT:id]] for +₹Z,XXX** → Ready for GPU upgrade later

---

## Build 2: Balanced Build ⚖️
[SAME STRUCTURE AS ABOVE]

---

## Build 3: Future-Ready 🚀
[SAME STRUCTURE AS ABOVE]
**Note:** This build uses the buffer budget for [specific component] to enable [future upgrade path].
OR
**Downgrade to meet budget:** If you need to hit exactly ₹XX,XXX, downgrade [component] to [alternative] [[PRODUCT:id]] and save ₹Z,XXX.

---

## 🎯 My Recommendation
Based on your query, I recommend **Build [1/2/3]** because:
- [Reason 1]
- [Reason 2]
- [Reason 3]

## Compatibility Notes
- [Any socket/chipset/PSU considerations]

## 💡 Pro Tips
- [Additional advice about the builds]
\`\`\`

## CRITICAL RULES
1. **GPU Priority:** For gaming builds, always prioritize GPU performance within budget constraints. Choose the best GPU that won't be bottlenecked by the CPU.
2. **No Bottlenecks:** Ensure CPU can handle the GPU. Don't pair i3 with RTX 4070.
3. **Buffer Handling:** Prefer leaving ₹2-3k buffer, but if using buffer gives significant performance gain (better GPU tier), clearly state: "*This build uses ₹X,XXX of the buffer to upgrade GPU from [A] to [B] for 25% better performance.*"
4. **Exact Prices:** All prices must be exact from CONTEXT. Never estimate.
5. **Product Tags:** Every product MUST have [[PRODUCT:id]] tag.
6. **Upgrade/Downgrade Options:** Always provide 2-3 specific options with exact products from context and price deltas.

## RESPONSE STRUCTURE FOR NON-BUDGET QUERIES (General Questions)
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

        let lastError: unknown = null;

        for (let keyIndex = 0; keyIndex < orderedApiKeys.length; keyIndex++) {
            const apiKey = orderedApiKeys[keyIndex];
            const provider = createGoogleGenerativeAI({ apiKey });

            try {
                const result = streamText({
                    model: provider("gemini-2.5-flash"),
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
                    api_key: maskApiKey(apiKey),
                    api_key_index: keyIndex,
                });

                return result.toUIMessageStreamResponse();
            } catch (error) {
                lastError = error;
                const info = classifyApiError(error);
                const hasNextKey = keyIndex < orderedApiKeys.length - 1;

                logger.warn("API", "Model call failed for API key", {
                    error_kind: info.kind,
                    retryable: info.retryable,
                    message: info.message,
                    api_key: maskApiKey(apiKey),
                    api_key_index: keyIndex,
                    will_try_next_key: hasNextKey,
                });

                if (!(info.kind === "quota_exhausted" || info.kind === "rate_limited") || !hasNextKey) {
                    break;
                }
            }
        }

        throw lastError ?? new Error("All API keys failed for model call");
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

