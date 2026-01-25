**Product Requirement Document (PRD)** for your AI-Powered PC Aggregator. This document aggregates every finding, competitor analysis, and creative feature we have discussed.

---

# Project Master Draft: AI-Driven PC Aggregator & Optimization Platform (India)

## 1. Executive Summary
**Vision:** To build the "Trivago" or "Skyscanner" of the Indian PC hardware market, but supercharged with a Generative AI consultant.
**The Gap:** Current Indian tools (PCPricetracker.in) are static data tables. Global tools (PCPartPicker) lack Indian pricing/retailer integration. AI tools (ChatGPT) hallucinate prices and stock.
**The Solution:** A unified platform aggregating real-time data from 10+ Indian retailers, featuring an AI that can plan builds, "roast" and fix user lists, and cross-reference custom builds against pre-built PCs to find the absolute best value.

---

## 2. Comprehensive Market & Competitor Analysis

### A. Local Indian Competitors
| Competitor | Core Function | Strengths | Critical Weaknesses (Our Opportunity) |
| :--- | :--- | :--- | :--- |
| **PCPricetracker.in** | Aggregator | The current gold standard for price lists. Fast, utilitarian. | **Zero guidance.** No AI. UI is a spreadsheet. Intimidating for beginners. |
| **PartsRadar.app** | Aggregator | Modern UI, price history, "AI" data cleaning. | AI is backend-only (cleaning data), not user-facing. No chat/consultation features. |
| **PCForgeAI** | AI Builder | Generates builds using AI. | **Retailer limitation.** Primarily scrapes Amazon. Misses cheaper deals from MD/Vedant. |
| **PickPCParts.in** | Guide/List | Good pre-set budget guides. | Static content. Updates are manual. No dynamic customization. |
| **TheMVP / Bitkart** | System Integrators | They sell complete PCs. Good UI. | **Biased.** They only sell their own inventory. They will never tell you if a competitor is cheaper. |

### B. Global Competitors (Reference Models)
*   **MSI EZ PC Builder:** Best-in-class "Questionnaire UI" (What games do you play? -> Result).
*   **Newegg PC Builder AI:** Strong "Upgrade Assistant" (analyzing current PC to suggest specific upgrades).
*   **PCPartPicker (US):** The benchmark for compatibility filters (dimensions, wattage).

---

## 3. Detailed Feature Specifications

### Module A: The "Conversational Architect" (Chat Mode)
*   **Description:** A full-screen chat interface acting as a human expert.
*   **Workflow:**
    1.  **User Prompt:** "I have ₹80k. I want to play GTA 6 (when it launches) and do Blender work. I like white RGB cases."
    2.  **RAG Retrieval:** The AI queries the database for:
        *   *Specs:* GTA 6 predicted requirements (high VRAM).
        *   *Inventory:* White cases in stock < ₹5000.
        *   *Pricing:* Best CPU/GPU combo fitting the remaining budget.
    3.  **Constraint Logic:** It prioritizes NVIDIA GPUs (better for Blender) over AMD, despite AMD often being cheaper for pure gaming.
    4.  **Output:** A structured list with links, plus a text explanation: *"I chose the RTX 4060 Ti (16GB) over the 4060 because Blender needs the extra VRAM, and it fits your white aesthetic."*

### Module B: The "Roast & Fix" Agent (Analyzer)
*   **Description:** Users input a list (manual or link), and the AI critiques it.
*   **Analysis Points:**
    *   **Bottleneck Check:** (e.g., "CPU is too weak for this GPU").
    *   **Overspending Alert:** "You selected a generic Samsung 980 Pro SSD for gaming. Switch to a WD SN770 to save ₹2,000 with zero performance loss."
    *   **Compatibility Deep-Dive:** "Warning: The Deepcool AK620 cooler is 160mm tall, but your chosen Galax case only supports 155mm. It will not fit."

### Module C: The "Pre-Built Arbitrage" Engine (Unique Differentiator)
*   **Description:** Real-time comparison between "Building it yourself" vs. "Buying Pre-built."
*   **Logic:**
    1.  User finalizes a custom cart. **Total: ₹1,10,000.**
    2.  System automatically scans pre-built listings from Bitkart, XRig, MVP, and Amazon.
    3.  **Scenario A (DIY is Cheaper):** "Good job. Buying a similar pre-built would cost ₹1,25,000. You are saving ₹15,000 by building it yourself."
    4.  **Scenario B (Pre-built is Cheaper):** "Alert! XRig is selling a PC with these exact specs for ₹1,08,000. It includes a warranty and OS. It is cheaper to buy this pre-built than to buy the parts separately."

### Module D: The "Multi-Path" Generator (Personas)
*   **Description:** The AI takes one budget (e.g., ₹1 Lakh) and generates three distinct "Build Personalities."
    1.  **"Frame Chaser" (AMD/Performance):** Max FPS per Rupee. Cheap case, stock cooler, high-end AMD GPU.
    2.  **"Studio/Aesthetic" (NVIDIA/Looks):** Balanced performance, Nvidia features (DLSS/Broadcast), Glass case, AIO cooler.
    3.  **"The Future-Proofer":** Spends extra on the Motherboard (AM5) and PSU (850W Gold) to allow for a massive GPU upgrade in 2 years without rebuilding.

### Module E: Market Pulse & AI Visualizer
*   **Market Pulse:** AI scans Reddit (r/IndianGaming) and Twitter for retailer sentiment.
    *   *Display:* "Price: ₹25,000 @ EliteHubs (Warning: Users reported shipping delays this week)."
*   **AI Visualizer:** A Generative Image feature where the user can click "Visualize Build" to see a mock-up of their chosen Case + RAM + Fans in their preferred color scheme.

---

## 4. Technical Architecture & Data Strategy

### A. The Scraper Engine (Input)
*   **Targets:** Amazon.in, Flipkart, MDComputers, Vedant, PrimeABGB, EliteHubs, Clarion, TheITDepot.
*   **Technology:**
    *   **Crawl4AI / Firecrawl:** These are AI-native scrapers that can read a webpage and extract JSON data even if the HTML structure changes. This reduces maintenance.
    *   **Proxy Network:** **BrightData** or **Scrape.do** to rotate IP addresses and avoid bans from Amazon/Flipkart.
*   **Frequency:** High volatility items (GPUs/CPUs) scraped every 6 hours. Low volatility (Cases/PSUs) every 24 hours.

### B. The Brain (RAG + LLM)
*   **Database:**
    *   **PostgreSQL:** Relational DB for hard data (Price, Stock Status, URL, SKU).
    *   **Vector Database (Pinecone):** For semantic data. We will embed reviews, product descriptions, and "use case" text.
*   **LLM Model:**
    *   **OpenAI GPT-4o:** For the user-facing Chat and "Roast" features (highest intelligence).
    *   **Llama 3 (hosted locally):** For backend data processing (normalizing product names) to save costs.
*   **RAG Workflow:**
    *   When a user asks for a "Gaming PC," the system does NOT ask the LLM for prices. It retrieves the *latest* prices from PostgreSQL, converts them to text context, and *then* asks the LLM to write the response based *only* on that context.

### C. The Frontend
*   **Framework:** **Next.js** (React) for fast, SEO-friendly rendering.
*   **UI Library:** Tailwind CSS + ShadCN for a clean, modern look.

---

## 5. Development Roadmap

### Phase 1: The Foundation (Months 1-2)
*   **Objective:** Functional Aggregator.
*   Develop Python scrapers for the "Big 5" Indian retailers.
*   Build the PostgreSQL database and normalization logic (mapping "Asus Dual 4060" and "ASUS GeForce RTX 4060 Dual" to one product ID).
*   Deploy basic search interface.

### Phase 2: The Intelligence (Months 3-4)
*   **Objective:** AI Integration.
*   Set up Vector Database (Pinecone) and RAG pipeline.
*   Develop the **"Chat-to-Build"** interface.
*   Develop the **"Roast & Fix"** logic (Compatibility algorithms).
*   **Milestone:** Alpha Launch to friends/tech discord groups.

### Phase 3: The Differentiators (Months 5-6)
*   **Objective:** Unique Market Features.
*   Implement **"Pre-built Arbitrage"** scraping (scraping full PCs and breaking down their value).
*   Implement **"Market Pulse"** (Sentiment analysis from Reddit).
*   **Milestone:** Public Beta Launch on r/IndianGaming.

### Phase 4: Moonshots (Post-Launch)
*   **"Box-to-Build" Assistant:** A mobile web feature where users upload photos of their parts, and Computer Vision (GPT-4 Vision) guides them on which cable goes where.

---

## 6. Business Model

1.  **Affiliate Marketing:**
    *   Amazon Associates (Standard).
    *   Direct partnerships with niche retailers (MDComputers/Vedant often have affiliate programs or can be negotiated with).
2.  **"Concierge Build" Service:**
    *   "Don't want to build it? Click here."
    *   Partner with a trusted local assembler (like a highly-rated shop in Nehru Place or Lamington Road). You forward the order to them, they build and ship, you take a 5-10% commission.
3.  **Data API:**
    *   Sell your cleaned, aggregated pricing API to other smaller tech blogs or reviewers.

---

## 7. Immediate Next Steps

1.  **Prototype Scraper:** Write a script using **Crawl4AI** to scrape just *one* product category (e.g., RTX 4060) from Amazon.in and MDComputers.in to verify data quality.
2.  **Data Structure Design:** Define the JSON schema for a "Product" that includes fields for: `Price`, `Stock`, `Retailer_Trust_Score`, `Dimensions` (for compatibility), and `Performance_Tier` (for AI logic).
