import { Product, ProductEmbedding } from "./products";
import productsData from "../../data/products.json";
import embeddingsData from "../../data/embeddings.json";

// Load data
const products: Product[] = productsData as Product[];
const embeddings: ProductEmbedding[] = embeddingsData as ProductEmbedding[];

// Create a map for quick embedding lookup
const embeddingMap = new Map<string, number[]>();
embeddings.forEach((e) => embeddingMap.set(e.id, e.embedding));

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
        const searchText = `${product.name} ${product.normalized_name} ${product.category} ${product.brand} ${product.use_cases.join(" ")}`.toLowerCase();

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
  Stock: ${p.stock ? "In Stock ✓" : "Out of Stock ✗"}
  Use Cases: ${p.use_cases.join(", ")}
  Key Specs: ${Object.entries(p.specs).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
        })
        .join("\n\n");
}
