import { google } from "@ai-sdk/google";
import { streamText } from "ai";
import { keywordSearch, getAllProducts, formatProductsAsContext } from "@/lib/search";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
    const { messages, mode } = await req.json();

    // Get the last user message
    const lastUserMessage = messages[messages.length - 1];
    const userQuery = lastUserMessage.content;

    // RAG Step 1: Retrieve context
    // For small dataset (10 items), we can just use keyword search or even all items
    // In production with thousands of items, we would use vector search here
    const searchResults = keywordSearch(userQuery);

    // If no results from keyword search, fallback to all products (since we only have 10)
    // This ensures the bot always has data to talk about in this demo
    const finalContextProducts = searchResults.length > 0 ? searchResults : getAllProducts();

    const productContext = formatProductsAsContext(finalContextProducts);

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
- The user has provided a build or is asking for feedback.
- Aggressively analyze their choices for bottlenecks, overspending, or bad value.
- If they picked a bad part, roast them (playfully) and suggest the better alternative from the Context.
- Example: "You paired a 4090 with a 450W PSU? Do you like fireworks? Buy this 850W Corsair unit instead."
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

    // Check for API Key
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        return new Response("Missing GOOGLE_GENERATIVE_AI_API_KEY in .env.local", { status: 500 });
    }

    try {
        const result = streamText({
            model: google("gemini-1.5-pro-latest"),
            messages: messages.map((m: any) => ({
                role: m.role,
                content: m.content
            })),
            system: systemPrompt,
        });

        return result.toTextStreamResponse();
    } catch (error) {
        console.error("Gemini API Error:", error);
        return new Response("Error communicating with AI service.", { status: 500 });
    }
}
