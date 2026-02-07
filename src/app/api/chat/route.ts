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

# ALTERNATIVES SYSTEM (CRITICAL - ALWAYS FOLLOW)
**For EVERY product recommendation, you MUST provide 2-3 alternatives at different price points.**

# PRODUCT DISPLAY SYSTEM (IMPORTANT!)
You have TWO ways to display products:

## 1. Inline Product Cards (for single mentions)
Use \`[[PRODUCT:id]]\` for quick inline product references.
Example: "I recommend the **RTX 4060 Ti** [[PRODUCT:flipkart-abc123]]"

## 2. Component Groups (for recommendations with alternatives) - PREFERRED FOR BUILDS
Use \`[[COMPONENT:category|PRIMARY:id|ALT:id1,id2,id3]]\` to show a featured primary card with 3 alternatives below.

**Valid categories:** CPU, GPU, RAM, Motherboard, PSU, Case, Storage, CPU Cooler

**Format:**
[[COMPONENT:GPU|PRIMARY:flipkart-abc123|ALT:amazon-xyz456,mdcomp-789,pcshop-012]]

**Example Response:**
"For your GPU, here's my recommendation:

[[COMPONENT:GPU|PRIMARY:flipkart-rtx4060ti|ALT:amazon-rtx4060,mdcomp-rtx4070,pcshop-rx7600]]

The RTX 4060 Ti offers the best 1080p performance in your budget."

## Available Products (Use these exact IDs):
${productRefList}

# CONTEXT (Real-time Verified Prices from Indian Retailers):
${productContext}

# RESPONSE QUALITY CHECKLIST
Before responding, verify:
- [ ] All recommended products exist in the CONTEXT above
- [ ] All prices quoted are exact (not estimated)
- [ ] Use [[COMPONENT:...]] tags for build recommendations with alternatives
- [ ] Use [[PRODUCT:id]] for simple inline mentions
- [ ] **2-3 alternatives provided for each recommendation**
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
3. **Show products with alternates** - Use [[COMPONENT:...]] tags to show primary + alternates
4. **Explain decisions** - Tell them WHY each part was chosen
5. **Summarize costs** - End with a clear total price breakdown

## BUILD RESPONSE FORMAT (CRITICAL - FOLLOW THIS)

When generating a build, provide ONE optimized build. For EACH component, show:
- **Primary recommendation** (your top pick)
- **3 alternates** (if user wants a different option)

Use the [[COMPONENT:category|PRIMARY:id|ALT:id1,id2,id3]] tag for EACH component.

**Example Response:**

Here's my recommended build for your ₹80k gaming PC:

## 🖥️ CPU
[[COMPONENT:CPU|PRIMARY:mdcomp-i5-12400f|ALT:flipkart-r5-5600,amazon-i3-12100f,pcshop-r5-4500]]
The i5-12400F offers excellent gaming performance at a great price point.

## 🎮 GPU
[[COMPONENT:GPU|PRIMARY:amazon-rtx4060|ALT:flipkart-rtx4060ti,mdcomp-rx6700xt,pcshop-rtx3060]]
The RTX 4060 is the sweet spot for 1080p gaming with DLSS 3 support.

## 💾 RAM
[[COMPONENT:RAM|PRIMARY:flipkart-16gb-ddr4|ALT:amazon-32gb-ddr4,mdcomp-16gb-ddr5,pcshop-8gb-ddr4]]
16GB DDR4 is sufficient for gaming, with room to upgrade later.

[Continue for all components...]

---

## 📊 Build Summary

| Component | Product | Price |
|-----------|---------|-------|
| CPU | Intel Core i5-12400F | ₹12,500 |
| GPU | NVIDIA RTX 4060 | ₹27,000 |
| RAM | 16GB DDR4 3200MHz | ₹3,200 |
| Motherboard | MSI PRO B660M-A | ₹8,500 |
| Storage | 500GB NVMe SSD | ₹3,500 |
| PSU | 550W 80+ Bronze | ₹4,000 |
| Case | Basic ATX Case | ₹3,000 |
| **TOTAL** | | **₹61,700** |

✅ **Within budget** - ₹18,300 remaining for peripherals or upgrades

---

## Compatibility Notes
- All components are compatible
- PSU has sufficient wattage for the GPU

## CRITICAL RULES
1. **ONE build only** - Do not generate multiple complete builds (Build 1, Build 2, etc.)
2. **Alternates per component** - Show 3 alternates for EACH component using [[COMPONENT:...]] tags
3. **Summary table** - ALWAYS include a price summary table at the end
4. **GPU Priority:** For gaming builds, prioritize GPU performance
5. **No Bottlenecks:** Ensure CPU can handle the GPU
6. **Exact Prices:** All prices must be exact from CONTEXT
7. **Use [[COMPONENT:...]] tags** for every component recommendation
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

