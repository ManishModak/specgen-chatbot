# Part 2: The Chatbot & RAG Experience (Days 5–9)

**Goal:** A futuristic "PC Architect" interface that chats with the user and recommends builds using the real-time data scraped in Part 1.

## Tech Stack
*   **Frontend:** Next.js (App Router), React
*   **Styling:** Tailwind CSS + ShadCN UI (Dark Mode/Cyberpunk aesthetic)
*   **AI Integration:** Vercel AI SDK + Gemini 3 Pro
*   **Backend:** In-Memory JSON Processing (No Database)

---

## Day 5: Frontend Skeleton
### 1. Project Init
*   Initialize `npx create-next-app` with Tailwind.
*   Install `shadcn-ui` components: `card`, `input`, `button`, `scroll-area`.

### 2. Design System
*   **Theme:** "Gamer Aesthetic". Dark backgrounds (`#0a0a0a`), Neon accents (Purple/Cyan gradients).
*   **Pages:**
    *   `src/app/page.tsx`: Landing page with a big "Start Building" button.
    *   `src/app/chat/page.tsx`: The main chat interface.

## Day 6: RAG Implementation (The Brain)
### 1. Retrieval Action (Local)
*   Create a utility `src/lib/search.ts`.
*   **Logic:**
    1.  Load `products.json` and `embeddings.json` into memory (variables).
    2.  Convert `userQuery` to a vector embedding (using Gemini API).
    3.  **Math:** Calculate Cosine Similarity between Query Vector and all Product Vectors.
    4.  Sort by score, take top 10.
    5.  Return the Product Objects.

### 2. The Chat Loop
*   Use `streamText` from Vercel AI SDK.
*   **System Prompt:**
    *"You are an expert PC Builder. I will provide you with a list of REAL products and prices from Indian retailers (Context). Use ONLY this context to recommend parts. If you recommend a part, list its price and the specific retailer. Do not make up prices."*

## Day 7: The "Roast & Fix" Feature (Wow Factor)
### Objective
Allow users to paste a PCPartPicker link or a text list, and have the AI critique it.

### Implementation
1.  **UI:** Add a "Roast My Build" mode switch in the chat.
2.  **Prompt:** *"Analyze this list for: 1. Bottlenecks, 2. Overspending, 3. Incompatibility. Then, look at the Context provided and suggest cheaper alternatives from our database."*
3.  **Demo Value:** This shows "reasoning" capabilities of Gemini 3, which judges look for.

## Day 8: Polish & Streaming UI
### 1. Generative UI (Tool Calling)
*   Instead of just text, if Gemini suggests a GPU, render a **Component** card.
*   **How:** Use `tool_calling`. If Gemini decides to show a product, it calls a tool `display_product_card(id)`.
*   **Result:** The user sees a nice Card with Image, Price, and "Buy" button inside the chat stream.

### 2. Performance
*   Ensure the "Typing effect" is smooth.
*   Add loading skeletons while the vector search is happening.

## Day 9: QA & Submission Material
### 1. The Demo Video (Critical)
*   **Script:**
    1.  **Hook (10s):** "Building a PC in India is hard. Prices change hourly."
    2.  **The Tech (20s):** Show the Scraper terminal running (Matrix style).
    3.  **The Solution (60s):** Show the Chatbot. Ask it for a build. Show it finding a cheaper deal on Vedant than MDComputers.
    4.  **The Roast (30s):** Paste a bad build and show the AI fixing it.
*   **Recording:** Use OBS. Record at 1080p.

### 2. Devpost Writeup
*   Highlight "Gemini 3 Integration" (Normalization + Chat + Embeddings).
*   Submit public GitHub repo.

## Day 10: Buffer
*   Fix last-minute deployment bugs (Vercel/Netlify).
*   Sleep.
