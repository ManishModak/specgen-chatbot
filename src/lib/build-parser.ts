/**
 * Build Parser - Extract PC components from user-pasted text
 */
import { Product } from "./products";
import { getAllProducts } from "./search";

export interface ParsedComponent {
    category: string;
    rawText: string;
    matchedProduct: Product | null;
    confidence: number; // 0-1 score
}

export interface ParsedBuild {
    components: ParsedComponent[];
    unmatchedText: string[];
}

// Component category patterns
const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
    GPU: [
        /\b(rtx|gtx|rx|radeon|geforce|nvidia|amd)\s*\d{3,4}\s*(ti|xt|super|s)?\b/i,
        /\bgraphics?\s*card\b/i,
        /\bgpu\b/i,
    ],
    CPU: [
        /\b(ryzen|intel|core)\s*(i[3579]|[3579])\s*[-\s]?\d{4,5}[a-z]*/i,
        /\b(i[3579])\s*[-\s]?\d{4,5}[a-z]*/i,
        /\bprocessor\b/i,
        /\bcpu\b/i,
    ],
    RAM: [
        /\b\d+\s*gb\s*(ddr[45])?\s*(ram)?\b/i,
        /\b(ddr[45])\s*\d+\s*gb\b/i,
        /\bram\b/i,
        /\bmemory\b/i,
        /\btrident\b/i,
        /\bvengeance\b/i,
    ],
    Motherboard: [
        /\b(b[456][56]0|x[56]70|z[67]90|h[67]10)\b/i,
        /\b(motherboard|mobo|mainboard)\b/i,
        /\btomahawk\b/i,
        /\bstrix\b/i,
    ],
    PSU: [
        /\b\d{3,4}\s*w(att)?\b/i,
        /\b(psu|power\s*supply)\b/i,
        /\b(gold|platinum|bronze|titanium)\s*(rated|certified)?\b/i,
        /\brm\d{3,4}\b/i,
        /\bcorsair\s+rm/i,
    ],
    Case: [
        /\b(case|chassis|cabinet|tower)\b/i,
        /\b(lancool|meshify|h[57]10|4000d|5000d)\b/i,
        /\b(mid\s*tower|full\s*tower|atx\s*case)\b/i,
    ],
    Storage: [
        /\b(ssd|nvme|hdd|hard\s*drive)\b/i,
        /\b(sn770|980\s*pro|970\s*evo|wd\s*black)\b/i,
        /\b\d+\s*(tb|gb)\s*(ssd|nvme|storage)?\b/i,
    ],
    "CPU Cooler": [
        /\b(cooler|cooling|heatsink|aio)\b/i,
        /\b(ak620|nh-d15|hyper\s*212|dark\s*rock)\b/i,
        /\b\d{2,3}mm\s*(aio|radiator)\b/i,
    ],
};

/**
 * Parse a text input and extract components
 */
export function parseBuildList(input: string): ParsedBuild {
    const products = getAllProducts();
    const lines = input.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    const components: ParsedComponent[] = [];
    const unmatchedText: string[] = [];

    for (const line of lines) {
        const parsed = parseComponent(line, products);
        if (parsed) {
            components.push(parsed);
        } else {
            unmatchedText.push(line);
        }
    }

    // If no structured lines, try to parse the whole input
    if (components.length === 0 && input.trim()) {
        const wholeInputParsed = extractComponentsFromText(input, products);
        components.push(...wholeInputParsed);
    }

    return { components, unmatchedText };
}

/**
 * Parse a single line/component
 */
function parseComponent(text: string, products: Product[]): ParsedComponent | null {
    const textLower = text.toLowerCase();

    // Try to detect category
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                // Found category, now try to match a product
                const matchedProduct = findBestMatch(text, products, category);
                return {
                    category,
                    rawText: text,
                    matchedProduct,
                    confidence: matchedProduct ? calculateConfidence(text, matchedProduct) : 0.3,
                };
            }
        }
    }

    return null;
}

/**
 * Extract components from freeform text
 */
function extractComponentsFromText(text: string, products: Product[]): ParsedComponent[] {
    const components: ParsedComponent[] = [];
    const textLower = text.toLowerCase();

    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const matchedProduct = findBestMatch(text, products, category);
                if (!components.some((c) => c.category === category)) {
                    components.push({
                        category,
                        rawText: match[0],
                        matchedProduct,
                        confidence: matchedProduct ? calculateConfidence(text, matchedProduct) : 0.3,
                    });
                }
                break;
            }
        }
    }

    return components;
}

/**
 * Find best matching product from database
 */
function findBestMatch(text: string, products: Product[], category: string): Product | null {
    const textLower = text.toLowerCase();
    const categoryProducts = products.filter(
        (p) => p.category.toLowerCase() === category.toLowerCase()
    );

    let bestMatch: Product | null = null;
    let bestScore = 0;

    for (const product of categoryProducts) {
        const score = calculateMatchScore(textLower, product);
        if (score > bestScore && score > 0.3) {
            bestScore = score;
            bestMatch = product;
        }
    }

    return bestMatch;
}

/**
 * Calculate match score between text and product
 */
function calculateMatchScore(text: string, product: Product): number {
    const searchTerms = [
        product.normalized_name,
        product.name.toLowerCase(),
        product.brand.toLowerCase(),
    ];

    let maxScore = 0;

    for (const term of searchTerms) {
        const termWords = term.split(/\s+/);
        let matches = 0;

        for (const word of termWords) {
            if (word.length > 2 && text.includes(word)) {
                matches++;
            }
        }

        const score = termWords.length > 0 ? matches / termWords.length : 0;
        maxScore = Math.max(maxScore, score);
    }

    return maxScore;
}

/**
 * Calculate confidence score for a match
 */
function calculateConfidence(text: string, product: Product): number {
    const textLower = text.toLowerCase();
    const normalizedName = product.normalized_name.toLowerCase();

    // Check for exact model number match
    if (textLower.includes(normalizedName)) {
        return 0.95;
    }

    // Check for brand + partial model
    if (textLower.includes(product.brand.toLowerCase())) {
        return 0.8;
    }

    return 0.6;
}

/**
 * Format parsed build as readable text
 */
export function formatParsedBuild(build: ParsedBuild): string {
    const lines: string[] = ["**Detected Components:**"];

    for (const comp of build.components) {
        if (comp.matchedProduct) {
            lines.push(
                `- ${comp.category}: "${comp.rawText}" → Matched: **${comp.matchedProduct.name}** (₹${comp.matchedProduct.price.toLocaleString("en-IN")})`
            );
        } else {
            lines.push(`- ${comp.category}: "${comp.rawText}" → No match in database`);
        }
    }

    if (build.unmatchedText.length > 0) {
        lines.push("\n**Could not parse:**");
        build.unmatchedText.forEach((t) => lines.push(`- ${t}`));
    }

    return lines.join("\n");
}
