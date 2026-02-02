/**
 * Generate Real Embeddings for Products using Gemini API
 * 
 * Run with: npx tsx scripts/generate-embeddings.ts
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!API_KEY) {
    console.error("❌ Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable");
    console.log("Run with: GOOGLE_GENERATIVE_AI_API_KEY=your_key npx tsx scripts/generate-embeddings.ts");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

interface Product {
    id: string;
    name: string;
    normalized_name: string;
    category: string;
    brand: string;
    use_cases: string[];
    specs: Record<string, unknown>;
}

interface EmbeddingEntry {
    id: string;
    text: string;
    vector: number[];
}

/**
 * Build a searchable text string for a product
 */
function buildProductText(product: Product): string {
    const specsText = Object.entries(product.specs)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");

    return `${product.name} ${product.normalized_name} ${product.category} ${product.brand} ${product.use_cases.join(" ")} ${specsText}`;
}

/**
 * Generate embedding for a single text using Gemini Embedding API
 */
async function generateEmbedding(text: string): Promise<number[]> {
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    return result.embedding.values;
}

async function main() {
    console.log("🚀 Starting embedding generation...\n");

    // Load products
    const productsPath = path.join(__dirname, "..", "data", "products.json");
    const productsRaw = fs.readFileSync(productsPath, "utf-8");
    const products: Product[] = JSON.parse(productsRaw);

    console.log(`📦 Loaded ${products.length} products\n`);

    const embeddings: EmbeddingEntry[] = [];

    for (const product of products) {
        const text = buildProductText(product);
        console.log(`⏳ Generating embedding for: ${product.name}`);

        try {
            const vector = await generateEmbedding(text);
            embeddings.push({
                id: product.id,
                text: text,
                vector: vector
            });
            console.log(`   ✅ Done (${vector.length} dimensions)`);
        } catch (error) {
            console.error(`   ❌ Error: ${error}`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Save embeddings
    const output = {
        model: "text-embedding-004",
        dimension: embeddings[0]?.vector.length || 768,
        generated_at: new Date().toISOString(),
        embeddings: embeddings
    };

    const outputPath = path.join(__dirname, "..", "data", "embeddings.json");
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 4));

    console.log(`\n✅ Saved ${embeddings.length} embeddings to ${outputPath}`);
    console.log(`   Dimension: ${output.dimension}`);
}

main().catch(console.error);
