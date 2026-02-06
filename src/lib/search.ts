import { Product } from "./products";
import productsData from "../../data/products.json";
import embeddingsData from "../../data/embeddings.json";
import { 
    matchGPUFromRegistry, 
    matchCPUFromRegistry, 
    checkCPUMotherboardCompatibility,
    getGPUGamingTier,
    getCPUGamingTier,
    isGamingSuitableGPU,
    isGamingSuitableCPU
} from "./registry-loader";

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

/**
 * Detect if query is for high-performance gaming
 */
function isHighPerformanceGamingQuery(query: string): boolean {
    const queryLower = query.toLowerCase();
    const highPerfIndicators = [
        "high settings", "ultra settings", "newer titles", "new games",
        "aaa games", "cyberpunk", "gta", "fps", "1440p", "4k",
        "rtx", "ray tracing", "competitive gaming", "esports"
    ];
    return highPerfIndicators.some(indicator => queryLower.includes(indicator));
}

/**
 * Check GPU suitability for gaming using registry data
 */
function checkGPUSuitability(product: Product, highPerformance: boolean): boolean {
    if (product.category !== "GPU") return true;
    return isGamingSuitableGPU(product.name, highPerformance);
}

/**
 * Check CPU suitability for gaming using registry data
 */
function checkCPUSuitability(product: Product): boolean {
    if (product.category !== "CPU") return true;
    return isGamingSuitableCPU(product.name);
}

/**
 * Get GPU performance tier using registry data
 */
function getGPUTier(product: Product): number {
    if (product.category !== "GPU") return 0;
    const tier = getGPUGamingTier(product.name);
    switch (tier) {
        case "enthusiast": return 10;
        case "high": return 7;
        case "good": return 5;
        case "minimum": return 3;
        default: return 0;
    }
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
                    const bDistance = Math.abs(b.price - catego
