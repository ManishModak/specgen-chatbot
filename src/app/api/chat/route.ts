import { google } from "@ai-sdk/google";
import { streamText, embed } from "ai";
import { keywordSearch, vectorSearch, getAllProducts, formatProductsAsContext, getProductById } from "@/lib/search";
import { parseBuildList, formatParsedBuild } from "@/lib/build-parser";
import { analyzeBuild, formatAnalysisAsContext } from "@/lib/build-analyzer";
import { Product } from "@/lib/products";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

/**
 * Generate embedding for user query using Gemini
 */
async function embedQuery(query: string): Promise<number[] | null> {
    try {
        const { embedding } = await embed({
            model: google.textEmbeddingModel("text-embedding-004"),
            value: query,
        });
        return embedding;
    } catch (error) {
        console.error("Embedding generation failed:", error);
        return null;
    }
}

export async function POST(req: Request) {
    console.log("\n========== [API] New Chat Request ==========");

    const { messages, mode } = await req.json();
    console.log(`[API] Mode: ${mode}`);
    console.log(`[API] Messages count: ${messages.length}`);

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
    console.log(`[API] User query: "${userQuery}"`);

    // RAG Step 1: Generate query embedding and perform vector search
    console.log("[RAG] Starting embedding generation...");
    let searchResults: Product[];
    const queryEmbedding = await embedQuery(userQuery);

    if (queryEmbedding) {
        console.log(`[RAG] Embedding generated: ${queryEmbedding.length} dimensions`);
        // Use semantic vector search
        searchResults = vectorSearch(queryEmbedding, 8);
        console.log(`[RAG] Vector search returned ${searchResults.length} results:`);
        searchResults.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} - ₹${p.price}`));
    } else {
        // Fallback to keyword search
        console.log("[RAG] Embedding failed, falling back to keyword search");
        searchResults = keywordSearch(userQuery, 8);
        console.log(`[RAG] Keyword search returned ${searchResults.length} results`);
    }

    // If no results, fallback to all products (since we only have 10)
    const finalContextProducts = searchResults.length > 0 ? searchResults : getAllProducts().slice(0, 10);
    console.log(`[RAG] Final context: ${finalContextProducts.length} products`);

    const productContext = formatProductsAsContext(finalContextProducts);
    console.log(`[RAG] Context size: ${productContext.length} characters`);

    // === ROAST MODE: Parse and Analyze Build ===
    let buildAnalysisContext = "";
    if (mode === "roast") {
        console.log("[ROAST] Parsing user build list...");
        const parsedBuild = parseBuildList(userQuery);
        console.log(`[ROAST] Detected ${parsedBuild.components.length} components`);

        if (parsedBuild.components.length > 0) {
            const analysis = analyzeBuild(parsedBuild);
            console.log(`[ROAST] Analysis score: ${analysis.overallScore}/100`);
            console.log(`[ROAST] Issues found: ${analysis.issues.length}`);

            buildAnalysisContext = `
BUILD ANALYSIS (Pre-computed by system):
${formatParsedBuild(parsedBuild)}

${formatAnalysisAsContext(analysis)}
`;
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
    console.log(`[API] System prompt size: ${systemPrompt.length} characters`);

    // Check for API Key
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.error("[API] ERROR: Missing API key!");
        return new Response("Missing GOOGLE_GENERATIVE_AI_API_KEY in .env.local", { status: 500 });
    }
    console.log("[API] API key found ✓");

    try {
        console.log("[API] Calling Gemini gemini-2.5-flash...");

        // Filter out messages with empty content
        const validMessages = messages
            .map((m: any) => ({
                role: m.role,
                content: getMessageContent(m)
            }))
            .filter((m: any) => m.content.length > 0);

        console.log(`[API] Valid messages: ${validMessages.length}`);

        const result = streamText({
            model: google("gemini-2.5-flash"),
            messages: validMessages,
            system: systemPrompt,
            onFinish: ({ text, usage }) => {
                console.log(`[API] Response complete!`);
                console.log(`[API] Response length: ${text.length} chars`);
                console.log(`[API] Tokens used: ${JSON.stringify(usage)}`);
                console.log(`[API] First 200 chars: ${text.substring(0, 200)}...`);
            }
        });

        console.log("[API] Streaming response to client...");
        return result.toUIMessageStreamResponse();
    } catch (error) {
        console.error("[API] Gemini API Error:", error);
        return new Response("Error communicating with AI service.", { status: 500 });
    }
}

