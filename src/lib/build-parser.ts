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
    extractedPrice?: number; // Price extracted from text
    sourceURL?: string; // Source URL if parsed from link
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
 * Supports: plain text, URLs (Amazon/Flipkart), PCPartPicker format
 */
export function parseBuildList(input: string): ParsedBuild {
    const products = getAllProducts();

    // Pre-process: detect and handle special formats
    let processedInput = input;
    const extractedPrices: Record<string, number> = {};

    // Handle PCPartPicker format (e.g., "Type | Item | Price")
    if (isPCPartPickerFormat(input)) {
        const pcppResult = parsePCPartPickerFormat(input, products);
        if (pcppResult.components.length > 0) {
            return pcppResult;
        }
    }

    // Extract URLs and try to match them
    const urlComponents = extractComponentsFromURLs(input, products);

    // Extract inline prices (e.g., "RTX 4070 - ₹50,000")
    const priceMatches = input.matchAll(/([₹$Rs\.]+\s*[\d,]+)/gi);
    for (const match of priceMatches) {
        const value = parsePrice(match[1]);
        if (value > 0) {
            extractedPrices[match.index?.toString() || "0"] = value;
        }
    }

    const lines = input.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    const components: ParsedComponent[] = [...urlComponents];
    const unmatchedText: string[] = [];
    const matchedCategories = new Set(urlComponents.map(c => c.category));

    for (const line of lines) {
        // Skip URL-only lines (already processed)
        if (/^https?:\/\//i.test(line.trim())) continue;

        const parsed = parseComponent(line, products);
        if (parsed && !matchedCategories.has(parsed.category)) {
            // Try to attach price if found inline
            if (!parsed.matchedProduct) {
                const linePrice = extractPriceFromText(line);
                if (linePrice > 0) {
                    parsed.extractedPrice = linePrice;
                }
            }
            components.push(parsed);
            matchedCategories.add(parsed.category);
        } else if (!parsed) {
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
 * Check if input is PCPartPicker format
 */
function isPCPartPickerFormat(input: string): boolean {
    return /type\s*\|\s*item/i.test(input) ||
        /\|\s*pcpartpicker/i.test(input) ||
        input.includes("| https://") ||
        /\*\*[A-Z]+\*\*/i.test(input); // Markdown format
}

/**
 * Parse PCPartPicker table format
 */
function parsePCPartPickerFormat(input: string, products: Product[]): ParsedBuild {
    const components: ParsedComponent[] = [];
    const unmatchedText: string[] = [];

    // Split by newline and process each row
    const lines = input.split(/\n/).filter(l => l.trim());

    for (const line of lines) {
        // Skip header rows
        if (/type\s*\|/i.test(line) || line.includes("---") || line.includes("===")) {
            continue;
        }

        // Try to parse as markdown table row: | Category | Item |
        const tableMatch = line.match(/\|\s*(?:\*\*)?([^|*]+)(?:\*\*)?\s*\|\s*\[?([^\]|]+)/);
        if (tableMatch) {
            const [, category, itemText] = tableMatch;
            const cleanCategory = category.trim().replace(/\*\*/g, "");
            const cleanItem = itemText.trim().replace(/\[|\]/g, "");

            // Map PCPartPicker categories to our categories
            const mappedCategory = mapPCPartPickerCategory(cleanCategory);
            if (mappedCategory) {
                const matchedProduct = findBestMatch(cleanItem, products, mappedCategory);
                components.push({
                    category: mappedCategory,
                    rawText: cleanItem,
                    matchedProduct,
                    confidence: matchedProduct ? calculateConfidence(cleanItem, matchedProduct) : 0.4,
                });
            } else {
                unmatchedText.push(line);
            }
            continue;
        }

        // Try to parse generic category: item format
        const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
        if (colonMatch) {
            const [, category, itemText] = colonMatch;
            const mappedCategory = mapPCPartPickerCategory(category.trim());
            if (mappedCategory) {
                const matchedProduct = findBestMatch(itemText.trim(), products, mappedCategory);
                components.push({
                    category: mappedCategory,
                    rawText: itemText.trim(),
                    matchedProduct,
                    confidence: matchedProduct ? calculateConfidence(itemText, matchedProduct) : 0.4,
                });
            }
        }
    }

    return { components, unmatchedText };
}

/**
 * Map PCPartPicker category names to our categories
 */
function mapPCPartPickerCategory(category: string): string | null {
    const categoryLower = category.toLowerCase().trim();

    const mapping: Record<string, string> = {
        "cpu": "CPU",
        "processor": "CPU",
        "gpu": "GPU",
        "video card": "GPU",
        "graphics card": "GPU",
        "graphics": "GPU",
        "motherboard": "Motherboard",
        "mobo": "Motherboard",
        "memory": "RAM",
        "ram": "RAM",
        "storage": "Storage",
        "ssd": "Storage",
        "hdd": "Storage",
        "power supply": "PSU",
        "psu": "PSU",
        "case": "Case",
        "tower": "Case",
        "cabinet": "Case",
        "chassis": "Case",
        "cpu cooler": "CPU Cooler",
        "cooler": "CPU Cooler",
        "cooling": "CPU Cooler",
    };

    return mapping[categoryLower] || null;
}

/**
 * Extract components from URLs in the text
 */
function extractComponentsFromURLs(text: string, products: Product[]): ParsedComponent[] {
    const components: ParsedComponent[] = [];

    // Find Amazon/Flipkart URLs
    const urlPattern = /https?:\/\/(www\.)?(amazon\.(in|com)|flipkart\.com)[^\s\n"'<>]+/gi;
    const urls = text.match(urlPattern) || [];

    for (const url of urls) {
        const parsed = parseProductURL(url, products);
        if (parsed) {
            components.push(parsed);
        }
    }

    return components;
}

/**
 * Parse a product URL and try to match it
 */
function parseProductURL(url: string, products: Product[]): ParsedComponent | null {
    try {
        const urlObj = new URL(url);
        let productName = "";

        // Amazon URL parsing
        if (urlObj.hostname.includes("amazon")) {
            // Amazon URLs often have product names in the path like /dp/B0XXXXX/Some-Product-Name
            const pathParts = urlObj.pathname.split("/");
            const dpIndex = pathParts.findIndex(p => p === "dp" || p === "gp");
            if (dpIndex > 0 && pathParts[dpIndex - 1]) {
                productName = pathParts[dpIndex - 1].replace(/-/g, " ");
            } else {
                // Try to extract from path
                const namePart = pathParts.find(p => p.length > 10 && !p.startsWith("B0"));
                if (namePart) {
                    productName = namePart.replace(/-/g, " ");
                }
            }
        }

        // Flipkart URL parsing
        if (urlObj.hostname.includes("flipkart")) {
            const pathParts = urlObj.pathname.split("/");
            const namePart = pathParts.find(p => p.length > 5 && !p.startsWith("p/") && p !== "p");
            if (namePart) {
                productName = namePart.replace(/-/g, " ");
            }
        }

        if (!productName) return null;

        // Try to detect category and find match
        for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
            for (const pattern of patterns) {
                if (pattern.test(productName)) {
                    const matchedProduct = findBestMatch(productName, products, category);
                    return {
                        category,
                        rawText: productName,
                        matchedProduct,
                        confidence: matchedProduct ? calculateConfidence(productName, matchedProduct) : 0.3,
                        sourceURL: url,
                    };
                }
            }
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Extract price from text string
 */
function extractPriceFromText(text: string): number {
    const priceMatch = text.match(/[₹$Rs\.]+\s*([\d,]+)/i);
    if (priceMatch) {
        return parsePrice(priceMatch[1]);
    }
    return 0;
}

/**
 * Parse price string to number
 */
function parsePrice(priceStr: string): number {
    const cleaned = priceStr.replace(/[₹$Rs\.,\s]/gi, "");
    const value = parseInt(cleaned, 10);
    return isNaN(value) ? 0 : value;
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
