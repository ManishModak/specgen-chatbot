import { Product } from "./products";
import productsData from "../../data/products.json";
import embeddingsData from "../../data/embeddings.json";

// Load data
const products: Product[] = productsData as Product[];

// Handle the actual embeddings.json structure: { embeddings: [{ id, text, vector }] }
type EmbeddingEntry = { id: string; text: string; vector: number[] };
const rawEmbeddings = (embeddingsData as { embeddings: EmbeddingEntry[] }).embeddings || [];

// Create a map for quick embedding lookup
const embeddingMap = new Map<string, number[]>();
rawEmbeddings.forEach((e) => embeddingMap.set(e.id, e.vector));

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Simple keyword-based search (fallback when no embeddings)
 */
export function keywordSearch(query: string, limit: number = 10): Product[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const scored = products.map((product) => {
        let score = 0;
        const useCasesText = product.use_cases?.join(" ") || "";
        const searchText = `${product.name} ${product.normalized_name} ${product.category} ${product.brand} ${useCasesText}`.toLowerCase();

        // Check each query term
        for (const term of queryTerms) {
            if (searchText.includes(term)) {
                score += 1;
            }
            // Bonus for exact category match
            if (product.category.toLowerCase() === term) {
                score += 2;
            }
            // Bonus for brand match
            if (product.brand.toLowerCase() === term) {
                score += 1.5;
            }
        }

        // Budget parsing
        const budgetMatch = query.match(/₹?\s*([\d,]+)\s*k?/i);
        if (budgetMatch) {
            let budget = parseInt(budgetMatch[1].replace(/,/g, ""));
            if (query.toLowerCase().includes("k") || query.toLowerCase().includes("lakh")) {
                budget = budget * 1000;
            }
            // Score products within budget higher
            if (product.price <= budget) {
                score += 1;
            }
        }

        return { product, score };
    });

    return scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.product);
}

/**
 * Vector similarity search using embeddings
 */
export function vectorSearch(
    queryEmbedding: number[],
    limit: number = 10
): Product[] {
    const scored = products.map((product) => {
        const productEmbedding = embeddingMap.get(product.id);
        const score = productEmbedding
            ? cosineSimilarity(queryEmbedding, productEmbedding)
            : 0;
        return { product, score };
    });

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.product);
}

/**
 * Get all products (for context building)
 */
export function getAllProducts(): Product[] {
    return products;
}

/**
 * Get products by category
 */
export function getProductsByCategory(category: string): Product[] {
    return products.filter(
        (p) => p.category.toLowerCase() === category.toLowerCase()
    );
}

/**
 * Get product by ID
 */
export function getProductById(id: string): Product | undefined {
    return products.find((p) => p.id === id);
}

function _stringifySpecValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(_stringifySpecValue).filter(Boolean).join(" / ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function _pickKeySpecs(product: Product, max: number = 5): string {
    const specs = (product.specs || {}) as Record<string, unknown>;

    const priorityByCategory: Record<string, string[]> = {
        GPU: ["chipset", "architecture", "vram", "vram_variants", "memory_type", "memory_bus_bit", "tdp_w"],
        CPU: ["architecture", "cores", "threads", "p_cores", "e_cores", "base_clock", "boost_clock", "socket", "cache_l3_mb", "tdp_w"],
        RAM: ["capacity", "type", "speed", "latency", "rgb"],
        Motherboard: ["chipset", "socket", "form_factor", "wifi", "ram_slots", "max_ram"],
        Storage: ["capacity", "interface", "read_speed", "write_speed"],
        PSU: ["wattage", "efficiency", "modular"],
        Case: ["max_gpu_length_mm", "max_cooler_height_mm", "color"],
        "CPU Cooler": ["tdp_rating", "height_mm", "fans", "socket_support"],
    };

    const ignoredKeys = new Set(["registry_id", "registry_family", "search_term"]);
    const priorityKeys = priorityByCategory[product.category] || [];

    const picked: Array<[string, unknown]> = [];
    const seen = new Set<string>();

    for (const key of priorityKeys) {
        if (picked.length >= max) break;
        const value = specs[key];
        if (value === undefined || value === null) continue;
        picked.push([key, value]);
        seen.add(key);
    }

    for (const [key, value] of Object.entries(specs)) {
        if (picked.length >= max) break;
        if (seen.has(key) || ignoredKeys.has(key)) continue;
        if (value === undefined || value === null) continue;
        picked.push([key, value]);
    }

    if (picked.length === 0) return "None";
    return picked.map(([k, v]) => `${k}: ${_stringifySpecValue(v)}`).join(", ");
}

/**
 * Format products as context for the LLM
 */
export function formatProductsAsContext(products: Product[]): string {
    if (products.length === 0) {
        return "No matching products found in the database.";
    }

    return products
        .map((p) => {
            const price = new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0,
            }).format(p.price);

            return `- **${p.name}** (${p.category})
  Price: ${price} @ ${p.retailer}
  Stock: ${p.stock !== false ? "In Stock ✓" : "Out of Stock ✗"}
  Use Cases: ${p.use_cases?.join(", ") || "General use"}
  Key Specs: ${_pickKeySpecs(p)}`;
        })
        .join("\n\n");
}
