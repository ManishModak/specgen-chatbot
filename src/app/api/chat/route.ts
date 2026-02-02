import { google } from "@ai-sdk/google";
import { streamText, embed } from "ai";
import { keywordSearch, vectorSearch, getAllProducts, formatProductsAsContext } from "@/lib/search";
import { parseBuildList, formatParsedBuild } from "@/lib/build-parser";
import { analyzeBuild, formatAnalysisAsContext } from "@/lib/build-analyzer";

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

    // Get the last user message
    const lastUserMessage = messages[messages.length - 1];
    const userQuery = lastUserMessage.content;
    console.log(`[API] User query: "${userQuery}"`);

    // RAG Step 1: Generate query embedding and perform vector search
    console.log("[RAG] Starting embedding generation...");
    let searchResults;
    const queryEmbedding = await embedQuery(userQuery);

    if (queryEmbedding) {
        console.log(`[RAG] Embedding generated: ${queryEmbedding.length} dimensions`);
        // Use semantic vector search
        searchResults = vectorSearch(queryEmbedding, 5);
        console.log(`[RAG] Vector search returned ${searchResults.length} results:`);
        searchResults.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} - ₹${p.price}`));
    } else {
        // Fallback to keyword search
        console.log("[RAG] Embedding failed, falling back to keyword search");
        searchResults = keywordSearch(userQuery, 5);
        console.log(`[RAG] Keyword search returned ${searchResults.length} results`);
    }

    // If no results, fallback to all products (since we only have 10)
    const finalContextProducts = searchResults.length > 0 ? searchResults : getAllProducts();
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

    // Define System Prompt based on Mode
    const baseSystemPrompt = `You are SpecGen, an expert PC builder and hardware consultant for the Indian market.
You are helpful, witty, and extremely knowledgeable about computer parts.

CRITICAL RULES:
1. You have access to real-time pricing and stock data from Indian retailers (MDComputers, Vedant, PrimeABGB, etc.) via the Context provided below.
2. ONLY recommend products from the provided Context. If a user asks for "RTX 4090" and it is not in the context, say "I don't have live pricing for the 4090 right now, but I can check..."
3. DO NOT hallucinate prices. Use the exact prices given in the context.
4. If the user's budget is low, be realistic.
5. Format your response using Markdown. Use bold for product names and prices.

CONTEXT (Real-time Data):
${productContext}
`;

    let modePrompt = "";
    if (mode === "roast") {
        modePrompt = `
CURRENT MODE: ROAST MASTER 🔥
- Your personality is sarcastic, critical, and "tough love".
- The user has provided a build for you to critique.
- Use the BUILD ANALYSIS section below - it contains pre-computed issues detected in their build.
- For each issue, ROAST them playfully but helpfully, then suggest the better alternative.
- Be savage but constructive. Make it entertaining!
- Example roasts:
  - "A 450W PSU with that GPU? Bold move. Hope you like the smell of burning electronics."
  - "Socket mismatch? Did you just pick parts by vibes? Let me help you..."
  - "CPU bottleneck detected. Your GPU is basically on vacation while your CPU sweats."

${buildAnalysisContext}
`;
    } else {
        modePrompt = `
CURRENT MODE: PC ARCHITECT 🔨
- Your personality is helpful, professional, and guiding.
- The user wants to build a PC.
- Ask clarifying questions if the budget or use-case is unclear.
- When recommending a build, list the parts with their prices and total cost.
- Explain WHY you chose each part (e.g., "I chose the Nvidia card because you mentioned Blender").
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

