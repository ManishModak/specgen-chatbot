/**
 * Sync Data Script
 * 
 * Transforms scraped JSONL data from specgen-scraper into the format
 * expected by specgen-chatbot's RAG system.
 * 
 * Usage: npx tsx scripts/sync-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Paths configuration
const SCRAPER_DATA_DIR = path.resolve(__dirname, '../../specgen-scraper/data');
const CHATBOT_DATA_DIR = path.resolve(__dirname, '../data');

const PRODUCTS_JSONL = path.join(SCRAPER_DATA_DIR, 'products_gpu.jsonl');
const EMBEDDINGS_JSON = path.join(SCRAPER_DATA_DIR, 'embeddings.json');
const OUTPUT_PRODUCTS = path.join(CHATBOT_DATA_DIR, 'products.json');
const OUTPUT_EMBEDDINGS = path.join(CHATBOT_DATA_DIR, 'embeddings.json');

// Types for scraped product
interface ScrapedProduct {
    id: string;
    name: string;
    normalized_name?: string;
    category?: string;
    brand?: string;
    price?: number;
    currency?: string;
    retailer?: string;
    url?: string;
    image?: string;
    stock?: boolean;
    last_scraped?: string;
    specs?: Record<string, unknown>;
    use_cases?: string[];
}

// Types for chatbot product
interface ChatbotProduct {
    id: string;
    name: string;
    normalized_name: string;
    category: string;
    brand: string;
    price: number;
    currency: string;
    retailer: string;
    url: string;
    image?: string;
    stock: boolean;
    last_scraped: string;
    specs: Record<string, unknown>;
    use_cases: string[];
    performance_tier: 'budget' | 'mid-range' | 'high-end';
}

/**
 * Infer performance tier based on price
 */
function inferPerformanceTier(price: number | undefined): 'budget' | 'mid-range' | 'high-end' {
    if (!price) return 'mid-range';
    if (price < 15000) return 'budget';
    if (price < 50000) return 'mid-range';
    return 'high-end';
}

/**
 * Infer use cases from category and specs
 */
function inferUseCases(category: string, specs: Record<string, unknown>): string[] {
    const useCases: string[] = [];
    const cat = (category || '').toLowerCase();

    if (cat === 'gpu' || cat === 'graphics') {
        useCases.push('gaming', '3D rendering');
        const vram = String(specs?.vram || '');
        if (vram.includes('12') || vram.includes('16') || vram.includes('24')) {
            useCases.push('4K gaming', 'AI/ML');
        } else if (vram.includes('8')) {
            useCases.push('1440p gaming');
        } else {
            useCases.push('1080p gaming');
        }
    } else if (cat === 'cpu') {
        useCases.push('productivity', 'multitasking');
    } else if (cat === 'ram') {
        useCases.push('multitasking', 'content creation');
    } else if (cat === 'motherboard') {
        useCases.push('system builds');
    }

    return useCases.length > 0 ? useCases : ['general computing'];
}

/**
 * Normalize category name - uses multiple signals for accuracy
 */
function normalizeCategory(category: string | undefined, name: string, specs: Record<string, unknown>): string {
    const cat = (category || '').toLowerCase();
    const nameLower = name.toLowerCase();
    const specsStr = JSON.stringify(specs).toLowerCase();

    // GPU detection - check name and specs for GPU indicators
    const gpuIndicators = ['rtx', 'gtx', 'geforce', 'radeon', 'rx ', 'rx-', 'arc a', 'arc b',
        'graphics card', 'gpu', 'gddr6', 'gddr5', 'vram', 'gaming graphics'];
    if (gpuIndicators.some(ind => nameLower.includes(ind) || specsStr.includes(ind))) {
        return 'GPU';
    }

    // CPU detection
    const cpuIndicators = ['ryzen', 'core i', 'intel core', 'processor', 'threadripper', 'xeon'];
    if (cpuIndicators.some(ind => nameLower.includes(ind))) {
        return 'CPU';
    }

    // Motherboard detection
    if (nameLower.includes('motherboard') || /\b(b[567]\d0|x[567]\d0|z[67]\d0)\b/i.test(nameLower)) {
        return 'Motherboard';
    }

    // Other categories from explicit category field
    if (cat.includes('cpu') || cat.includes('processor')) return 'CPU';
    if (cat.includes('motherboard') || cat.includes('mobo')) return 'Motherboard';
    if (cat.includes('psu') || cat.includes('power')) return 'PSU';
    if (cat.includes('case') || cat.includes('cabinet')) return 'Case';
    if (cat.includes('storage') || cat.includes('ssd') || cat.includes('hdd')) return 'Storage';
    if (cat.includes('cooler')) return 'CPU Cooler';
    if (cat.includes('ram') && !gpuIndicators.some(ind => nameLower.includes(ind))) return 'RAM';

    return 'GPU'; // Default for this GPU-focused integration
}

/**
 * Transform scraped product to chatbot format
 */
function transformProduct(scraped: ScrapedProduct): ChatbotProduct | null {
    // Skip products without essential fields
    if (!scraped.id || !scraped.name) {
        console.log(`Skipping product without id/name`);
        return null;
    }

    // Skip products without price (can't be useful for recommendations)
    if (!scraped.price || scraped.price <= 0) {
        return null;
    }

    const specs = scraped.specs || {};
    const category = normalizeCategory(scraped.category, scraped.name, specs);

    return {
        id: scraped.id,
        name: scraped.name,
        normalized_name: scraped.normalized_name || scraped.name.toLowerCase(),
        category,
        brand: scraped.brand || 'Unknown',
        price: scraped.price,
        currency: scraped.currency || 'INR',
        retailer: scraped.retailer || 'Unknown',
        url: scraped.url || '',
        image: scraped.image,
        stock: scraped.stock !== false, // Default to true/in-stock
        last_scraped: scraped.last_scraped || new Date().toISOString(),
        specs,
        use_cases: scraped.use_cases?.length ? scraped.use_cases : inferUseCases(category, specs),
        performance_tier: inferPerformanceTier(scraped.price),
    };
}

/**
 * Read JSONL file and parse products
 */
async function readJsonlProducts(filePath: string): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];

    if (!fs.existsSync(filePath)) {
        throw new Error(`Source file not found: ${filePath}`);
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const product = JSON.parse(line);
            products.push(product);
        } catch (err) {
            console.error(`Failed to parse line: ${line.substring(0, 100)}...`);
        }
    }

    return products;
}

/**
 * Main function
 */
async function main() {
    console.log('🔄 SpecGen Data Sync');
    console.log('====================\n');

    // Check source files exist
    console.log(`📁 Source JSONL: ${PRODUCTS_JSONL}`);
    if (!fs.existsSync(PRODUCTS_JSONL)) {
        console.error('❌ Source JSONL file not found!');
        console.error('   Run the scraper first: cd ../specgen-scraper && python src/main.py --site amazon --output data/raw/amazon_gpu.jsonl');
        process.exit(1);
    }

    // Read and transform products
    console.log('\n📖 Reading scraped products...');
    const scrapedProducts = await readJsonlProducts(PRODUCTS_JSONL);
    console.log(`   Found ${scrapedProducts.length} raw products`);

    console.log('\n🔧 Transforming products...');
    const transformedProducts: ChatbotProduct[] = [];
    let skipped = 0;

    for (const scraped of scrapedProducts) {
        const transformed = transformProduct(scraped);
        if (transformed) {
            transformedProducts.push(transformed);
        } else {
            skipped++;
        }
    }

    console.log(`   Transformed: ${transformedProducts.length}`);
    console.log(`   Skipped (no price): ${skipped}`);

    // Deduplicate by ID (keep first occurrence)
    const seen = new Set<string>();
    const uniqueProducts = transformedProducts.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
    });
    console.log(`   Unique: ${uniqueProducts.length}`);

    // Write output
    console.log(`\n💾 Writing ${OUTPUT_PRODUCTS}...`);
    fs.writeFileSync(OUTPUT_PRODUCTS, JSON.stringify(uniqueProducts, null, 2));
    console.log(`   ✓ Wrote ${uniqueProducts.length} products`);

    // Copy embeddings if available
    if (fs.existsSync(EMBEDDINGS_JSON)) {
        console.log(`\n📋 Copying embeddings from scraper...`);
        fs.copyFileSync(EMBEDDINGS_JSON, OUTPUT_EMBEDDINGS);
        console.log(`   ✓ Embeddings copied`);
    } else {
        console.log(`\n⚠️  No embeddings.json found in scraper.`);
        console.log('   Run: cd ../specgen-scraper && python src/embed.py');
    }

    console.log('\n✅ Sync complete!');
    console.log(`   Products: ${uniqueProducts.length}`);
    console.log(`   Output: ${OUTPUT_PRODUCTS}`);
}

main().catch((err) => {
    console.error('❌ Sync failed:', err.message);
    process.exit(1);
});
