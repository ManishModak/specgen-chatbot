import { Product } from "./products";
import productsData from "../../data/products.json";
import embeddingsData from "../../data/embeddings.json";

// Load data
const products: Product[] = productsData as Product[];

const BUILD_CATEGORIES: Product["category"][] = [
    "CPU",
    "GPU",
    "Motherboard",
    "RAM",
    "Storage",
    "PSU",
    "Case",
    "CPU Cooler",
];

function parseBudgetFromQuery(query: string): number | null {
    const queryLower = query.toLowerCase();
    const budgetMatch = queryLower.match(/(?:rs\.?|inr|₹)?\s*([\d,]+)\s*(k)?\b/i);
    if (!budgetMatch) return null;

    let budget = Number.parseInt(budgetMatch[1].replace(/,/g, ""), 10);
    if (Number.isNaN(budget)) return null;

    if (budgetMatch[2] || budget <= 999) {
        budget = budget * 1000;
    }

    return budget;
}

function isBuildQuery(query: string): boolean {
    const queryLower = query.toLowerCase();
    const indicators = [
        "pc",
        "build",
        "computer",
        "rig",
        "setup",
        "gaming pc",
        "workstation",
        "gaming",
    ];

    const hasBuildTerm = indicators.some((term) => queryLower.includes(term));
    const hasBudget = parseBudgetFromQuery(queryLower) !== null;
    return hasBuildTerm || hasBudget;
}

function dedupeProducts(list: Product[]): Product[] {
    const seen = new Set<string>();
    const result: Product[] = [];

    for (const p of list) {
        const key = `${p.category}|${p.normalized_name || p.name.toLowerCase()}|${p.price}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(p);
    }

    return result;
}

function categoryBudgetTarget(category: Product["category"], budget: number): number {
    switch (category) {
        case "GPU":
            return budget * 0.35;
        case "CPU":
            return budget * 0.25;
        case "Motherboard":
            return budget * 0.15;
        case "RAM":
            return budget * 0.10;
        case "Storage":
            return budget * 0.08;
        case "PSU":
            return budget * 0.08;
        case "Case":
            return budget * 0.08;
        case "CPU Cooler":
            return budget * 0.05;
        default:
            return budget * 0.10;
    }
}

function pickCategoryFallback(category: Product["category"], budget: number | null): Product | null {
    const candidates = products.filter((p) => p.category === category && p.stock !== false);
    if (candidates.length === 0) return null;

    if (!budget) {
        return [...candidates].sort((a, b) => a.price - b.price)[0];
    }

    const target = categoryBudgetTarget(category, budget);
    const upperBound = target * 1.5;

    const nearTarget = candidates
        .filter((p) => p.price <= upperBound)
        .sort((a, b) => Math.abs(a.price - target) - Math.abs(b.price - target));

    if (nearTarget.length > 0) return nearTarget[0];

    return [...candidates].sort((a, b) => a.price - b.price)[0];
}

export function optimizeResultsForQuery(query: string, initialResults: Product[], limit: number = 10): Product[] {
    const deduped = dedupeProducts(initialResults);
    if (!isBuildQuery(query)) {
        return deduped.slice(0, limit);
    }

    const budget = parseBudgetFromQuery(query);
    const selected: Product[] = [];
    const selectedIds = new Set<string>();

    for (const category of BUILD_CATEGORIES) {
        const fromInitial = deduped.find((p) => p.category === category && !selectedIds.has(p.id));
        const candidate = fromInitial ?? pickCategoryFallback(category, budget);
        if (!candidate || selectedIds.has(candidate.id)) continue;
        selected.push(candidate);
        selectedIds.add(candidate.id);
    }

    for (const p of deduped) {
        if (selected.length >= limit) break;
        if (selectedIds.has(p.id)) continue;
        selected.push(p);
        selectedIds.add(p.id);
    }

    return selected.slice(0, limit);
}

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

    // Detect if this is a PC build query
    const isPcBuildQuery = isBuildQuery(query);
    const budget = parseBudgetFromQuery(query);

    // For PC build queries, return diverse products from each category
    if (isPcBuildQuery && budget) {
        const categories = ['CPU', 'GPU', 'Motherboard', 'RAM', 'Storage', 'PSU', 'Case', 'CPU Cooler'];
        const result: Product[] = [];

        for (const category of categories) {
            // Get products from this category within budget
            const categoryProducts = products
                .filter(p => p.category === category && p.stock !== false)
                .sort((a, b) => {
                    // Prefer products closer to (but under) a reasonable fraction of budget
                    const categoryBudget = category === 'GPU' ? budget! * 0.35
                        : category === 'CPU' ? budget! * 0.25
                            : category === 'Motherboard' ? budget! * 0.15
                                : category === 'RAM' ? budget! * 0.10
                                    : category === 'Storage' ? budget! * 0.08
                                        : category === 'PSU' ? budget! * 0.08
                                            : category === 'Case' ? budget! * 0.08
                                                : budget! * 0.05;

                    const aDistance = Math.abs(a.price - categoryBudget);
                    const bDistance = Math.abs(b.price - categoryBudget);
                    return aDistance - bDistance;
                });

            // Add top product from each category
            if (categoryProducts.length > 0) {
                result.push(categoryProducts[0]);
            }
        }

        return optimizeResultsForQuery(query, result, limit);
    }

    // Standard keyword search for non-build queries
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

        // Score products within budget higher
        if (budget && product.price <= budget) {
            score += 1;
        }

        return { product, score };
    });

    const results = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.product);

    return optimizeResultsForQuery(query, results, limit);
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
        const score = productEmbedding && productEmbedding.length === queryEmbedding.length
            ? cosineSimilarity(queryEmbedding, productEmbedding)
            : 0;
        return { product, score };
    });

    return scored
        .filter((s) => s.score > 0)
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
