/**
 * Build Analyzer - Detect issues, bottlenecks, and suggest alternatives
 */
import { Product, formatPrice } from "./products";
import { ParsedBuild, ParsedComponent } from "./build-parser";
import { getAllProducts, getProductsByCategory } from "./search";

export type IssueType =
    | "bottleneck"
    | "psu_warning"
    | "compatibility"
    | "overspending"
    | "missing"
    | "ram_compatibility"
    | "chipset_mismatch"
    | "cooling_inadequate"
    | "storage_slots";

export interface AnalysisIssue {
    type: IssueType;
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    suggestion?: string;
    alternativeProduct?: Product;
    savingsAmount?: number;
}

export interface BuildAnalysis {
    issues: AnalysisIssue[];
    totalPrice: number;
    missingCategories: string[];
    overallScore: number; // 0-100
}

// Performance tier rankings (higher = better)
const TIER_SCORES: Record<string, number> = {
    "budget": 1,
    "mid-range": 2,
    "high-end": 3,
};

// Required categories for a complete build
const REQUIRED_CATEGORIES = ["CPU", "GPU", "RAM", "Motherboard", "PSU", "Storage"];

/**
 * Analyze a parsed build for issues
 */
export function analyzeBuild(build: ParsedBuild): BuildAnalysis {
    const issues: AnalysisIssue[] = [];
    const products = getAllProducts();

    // Get matched products by category
    const matchedByCategory = new Map<string, Product>();
    for (const comp of build.components) {
        if (comp.matchedProduct) {
            matchedByCategory.set(comp.category, comp.matchedProduct);
        }
    }

    // Check for missing essential categories
    const missingCategories: string[] = [];
    for (const cat of REQUIRED_CATEGORIES) {
        if (!matchedByCategory.has(cat)) {
            missingCategories.push(cat);
        }
    }

    if (missingCategories.length > 0) {
        issues.push({
            type: "missing",
            severity: "info",
            title: "Incomplete Build",
            description: `Missing components: ${missingCategories.join(", ")}`,
            suggestion: "Add the missing components for a complete build.",
        });
    }

    // Check CPU/GPU bottleneck
    const cpu = matchedByCategory.get("CPU");
    const gpu = matchedByCategory.get("GPU");
    if (cpu && gpu) {
        const cpuTier = TIER_SCORES[cpu.performance_tier ?? "mid-range"] || 2;
        const gpuTier = TIER_SCORES[gpu.performance_tier ?? "mid-range"] || 2;

        if (cpuTier < gpuTier) {
            issues.push({
                type: "bottleneck",
                severity: "warning",
                title: "CPU Bottleneck Detected 🔻",
                description: `Your ${cpu.name} (${cpu.performance_tier}) may bottleneck the ${gpu.name} (${gpu.performance_tier}).`,
                suggestion: "Consider upgrading to a higher-tier CPU to fully utilize your GPU.",
            });
        } else if (gpuTier < cpuTier) {
            issues.push({
                type: "bottleneck",
                severity: "info",
                title: "GPU Bottleneck Detected",
                description: `Your ${gpu.name} may limit gaming performance. The ${cpu.name} can handle a better GPU.`,
                suggestion: "Consider upgrading the GPU for better gaming performance.",
            });
        }
    }

    // Check PSU wattage
    const psu = matchedByCategory.get("PSU");
    if (cpu && gpu && psu) {
        const estimatedTDP = estimateTotalTDP(cpu, gpu);
        const psuWattage = psu.specs.wattage || 0;

        if (psuWattage < estimatedTDP * 1.2) {
            // Need 20% headroom
            const recommendedWattage = Math.ceil(estimatedTDP * 1.3 / 50) * 50;
            const betterPSU = findBetterPSU(recommendedWattage, products);

            issues.push({
                type: "psu_warning",
                severity: "critical",
                title: "⚠️ Insufficient PSU Wattage",
                description: `Your ${psu.name} (${psuWattage}W) is risky for this build. Estimated system draw: ~${estimatedTDP}W.`,
                suggestion: `Upgrade to at least ${recommendedWattage}W PSU for safe operation.`,
                alternativeProduct: betterPSU,
            });
        }
    }

    // Check socket compatibility (CPU + Motherboard)
    const mobo = matchedByCategory.get("Motherboard");
    if (cpu && mobo) {
        const cpuSocket = cpu.specs.socket;
        const moboSocket = mobo.specs.socket;

        if (cpuSocket && moboSocket && cpuSocket !== moboSocket) {
            issues.push({
                type: "compatibility",
                severity: "critical",
                title: "🔴 Socket Mismatch!",
                description: `${cpu.name} uses ${cpuSocket} but ${mobo.name} uses ${moboSocket}. These are incompatible!`,
                suggestion: `Get a motherboard with ${cpuSocket} socket, or change your CPU to match ${moboSocket}.`,
            });
        }
    }

    // Check cooler clearance
    const cooler = matchedByCategory.get("CPU Cooler");
    const pcCase = matchedByCategory.get("Case");
    if (cooler && pcCase) {
        const coolerHeight = cooler.specs.height_mm || 0;
        const maxCoolerHeight = pcCase.specs.max_cooler_height_mm || 999;

        if (coolerHeight > maxCoolerHeight) {
            issues.push({
                type: "compatibility",
                severity: "critical",
                title: "❌ Cooler Won't Fit!",
                description: `${cooler.name} is ${coolerHeight}mm tall, but ${pcCase.name} only supports ${maxCoolerHeight}mm.`,
                suggestion: "Choose a shorter cooler or a case with more CPU cooler clearance.",
            });
        }
    }

    // Check GPU length
    if (gpu && pcCase) {
        const gpuLength = gpu.specs.length_mm || 0;
        const maxGpuLength = pcCase.specs.max_gpu_length_mm || 999;

        if (gpuLength > maxGpuLength) {
            issues.push({
                type: "compatibility",
                severity: "critical",
                title: "❌ GPU Won't Fit!",
                description: `${gpu.name} is ${gpuLength}mm long, but ${pcCase.name} only supports ${maxGpuLength}mm.`,
                suggestion: "Choose a shorter GPU or a larger case.",
            });
        }
    }

    // === NEW CHECKS ===

    // Check DDR4 vs DDR5 RAM compatibility with motherboard
    const ram = matchedByCategory.get("RAM");
    if (ram && mobo) {
        const ramType = detectDDRType(ram);
        const moboRamType = detectMoboDDRSupport(mobo);

        if (ramType && moboRamType && ramType !== moboRamType) {
            issues.push({
                type: "ram_compatibility",
                severity: "critical",
                title: "🔴 RAM Type Mismatch!",
                description: `${ram.name} is ${ramType} but ${mobo.name} supports ${moboRamType}. They are incompatible!`,
                suggestion: `Get ${moboRamType} RAM to match your motherboard, or change motherboard to ${ramType}-compatible.`,
            });
        }
    }

    // Check chipset mismatch (Intel CPU with AMD board or vice versa)
    if (cpu && mobo) {
        const cpuBrand = detectCPUBrand(cpu);
        const moboPlatform = detectMoboPlatform(mobo);

        if (cpuBrand && moboPlatform && cpuBrand !== moboPlatform) {
            issues.push({
                type: "chipset_mismatch",
                severity: "critical",
                title: "🔴 Platform Mismatch!",
                description: `${cpu.name} (${cpuBrand}) cannot work on ${mobo.name} (${moboPlatform} platform)!`,
                suggestion: `Use an ${cpuBrand} motherboard for your ${cpuBrand} CPU.`,
            });
        }
    }

    // Check cooling adequacy for high-TDP CPUs
    if (cpu && !cooler) {
        const cpuTDP = parseInt(cpu.specs.tdp?.replace(/\D/g, "") || "65");

        if (cpuTDP >= 105) {
            const recommendedCooler = findAftermarketCooler(cpuTDP, products);
            issues.push({
                type: "cooling_inadequate",
                severity: "warning",
                title: "🌡️ Cooling May Be Insufficient",
                description: `${cpu.name} has a TDP of ${cpuTDP}W. Stock cooler may struggle under load.`,
                suggestion: "Add an aftermarket cooler for better thermals and sustained performance.",
                alternativeProduct: recommendedCooler,
            });
        }
    }

    // Check overspending on components
    const overspendingIssues = checkOverspending(matchedByCategory, products);
    issues.push(...overspendingIssues);

    // Calculate total price
    let totalPrice = 0;
    for (const product of matchedByCategory.values()) {
        totalPrice += product.price;
    }

    // Calculate overall score (100 = perfect, 0 = disaster)
    let overallScore = 100;
    for (const issue of issues) {
        if (issue.severity === "critical") overallScore -= 25;
        else if (issue.severity === "warning") overallScore -= 10;
        else overallScore -= 5;
    }
    overallScore = Math.max(0, overallScore);

    return {
        issues,
        totalPrice,
        missingCategories,
        overallScore,
    };
}

/**
 * Estimate total system TDP
 */
function estimateTotalTDP(cpu: Product, gpu: Product): number {
    const cpuTDP = parseInt(cpu.specs.tdp?.replace(/\D/g, "") || "65");
    const gpuTDP = parseInt(gpu.specs.tdp?.replace(/\D/g, "") || "150");

    // Add ~100W overhead for mobo, RAM, storage, fans
    return cpuTDP + gpuTDP + 100;
}

/**
 * Find a better PSU with more wattage
 */
function findBetterPSU(minWattage: number, products: Product[]): Product | undefined {
    const psus = products.filter((p) => p.category === "PSU");
    return psus.find((p) => (p.specs.wattage || 0) >= minWattage);
}

/**
 * Detect DDR type from RAM product
 */
function detectDDRType(ram: Product): "DDR4" | "DDR5" | null {
    const name = ram.name.toLowerCase();
    const type = ram.specs.type?.toLowerCase() || "";

    if (name.includes("ddr5") || type.includes("ddr5")) return "DDR5";
    if (name.includes("ddr4") || type.includes("ddr4")) return "DDR4";

    // Check by speed - DDR5 starts at 4800MHz
    const speed = ram.specs.speed;
    if (speed) {
        const mhz = parseInt(speed.replace(/\D/g, ""));
        if (mhz >= 4800) return "DDR5";
        if (mhz >= 2133 && mhz < 4800) return "DDR4";
    }

    return null;
}

/**
 * Detect DDR support from motherboard
 */
function detectMoboDDRSupport(mobo: Product): "DDR4" | "DDR5" | null {
    const name = mobo.name.toLowerCase();
    const chipset = mobo.specs.chipset?.toLowerCase() || "";

    // Check explicit DDR in specs or name
    if (name.includes("ddr5") || mobo.specs.type?.toLowerCase().includes("ddr5")) return "DDR5";
    if (name.includes("ddr4") || mobo.specs.type?.toLowerCase().includes("ddr4")) return "DDR4";

    // Infer from chipset (general rules)
    // Intel 700-series = DDR5 (some support DDR4)
    // AMD B650/X670 = DDR5, B550/X570 = DDR4
    if (chipset.includes("b650") || chipset.includes("x670") || chipset.includes("x870")) return "DDR5";
    if (chipset.includes("b550") || chipset.includes("x570") || chipset.includes("b450")) return "DDR4";
    if (chipset.includes("z790") || chipset.includes("z690")) return "DDR5"; // Default assumption
    if (chipset.includes("b660") || chipset.includes("h670") || chipset.includes("b760")) return "DDR4"; // Often DDR4

    return null;
}

/**
 * Detect CPU brand (Intel vs AMD)
 */
function detectCPUBrand(cpu: Product): "Intel" | "AMD" | null {
    const name = cpu.name.toLowerCase();
    const brand = cpu.brand.toLowerCase();

    if (brand.includes("intel") || name.includes("intel") || name.includes("core i")) return "Intel";
    if (brand.includes("amd") || name.includes("amd") || name.includes("ryzen") || name.includes("athlon")) return "AMD";

    return null;
}

/**
 * Detect motherboard platform (Intel vs AMD)
 */
function detectMoboPlatform(mobo: Product): "Intel" | "AMD" | null {
    const name = mobo.name.toLowerCase();
    const chipset = mobo.specs.chipset?.toLowerCase() || "";

    // AMD chipsets
    if (chipset.includes("b650") || chipset.includes("x670") || chipset.includes("x870") ||
        chipset.includes("b550") || chipset.includes("x570") || chipset.includes("b450") ||
        chipset.includes("x370") || chipset.includes("b350") || chipset.includes("a520")) {
        return "AMD";
    }

    // Intel chipsets
    if (chipset.includes("z790") || chipset.includes("z690") || chipset.includes("b760") ||
        chipset.includes("b660") || chipset.includes("h670") || chipset.includes("h610") ||
        chipset.includes("z590") || chipset.includes("b560") || chipset.includes("h510")) {
        return "Intel";
    }

    // Fallback to name check
    if (name.includes("amd") || name.includes("am4") || name.includes("am5")) return "AMD";
    if (name.includes("intel") || name.includes("lga 1700") || name.includes("lga 1200")) return "Intel";

    return null;
}

/**
 * Find an aftermarket cooler suitable for high-TDP CPUs
 */
function findAftermarketCooler(cpuTDP: number, products: Product[]): Product | undefined {
    const coolers = products.filter((p) => p.category === "CPU Cooler");

    // Find coolers rated for at least the CPU TDP
    const suitable = coolers.filter((c) => {
        const rating = c.specs.tdp_rating;
        if (!rating) return true; // Unknown rating, include
        const ratedTDP = parseInt(rating.replace(/\D/g, ""));
        return ratedTDP >= cpuTDP;
    });

    // Sort by price (cheapest adequate cooler)
    return suitable.sort((a, b) => a.price - b.price)[0];
}

/**
 * Check for overspending on components
 */
function checkOverspending(matchedByCategory: Map<string, Product>, allProducts: Product[]): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    for (const [category, product] of matchedByCategory.entries()) {
        // Find cheaper alternatives with similar specs
        const alternatives = allProducts.filter((p) =>
            p.category === category &&
            p.id !== product.id &&
            p.price < product.price * 0.75 && // At least 25% cheaper
            p.stock !== false &&
            p.performance_tier === product.performance_tier // Same tier
        );

        if (alternatives.length > 0) {
            const cheapest = alternatives.sort((a, b) => a.price - b.price)[0];
            const savings = product.price - cheapest.price;

            if (savings >= 2000) { // At least ₹2000 savings
                issues.push({
                    type: "overspending",
                    severity: "info",
                    title: `💸 Overspending on ${category}`,
                    description: `${product.name} costs ₹${product.price.toLocaleString("en-IN")}. A similar option is available for less.`,
                    suggestion: `Consider ${cheapest.name} to save ₹${savings.toLocaleString("en-IN")}.`,
                    alternativeProduct: cheapest,
                    savingsAmount: savings,
                });
            }
        }
    }

    return issues;
}

/**
 * Format analysis as context for LLM
 */
export function formatAnalysisAsContext(analysis: BuildAnalysis): string {
    const lines: string[] = [];

    lines.push(`**Build Analysis Score: ${analysis.overallScore}/100**`);
    lines.push(`**Estimated Total: ₹${analysis.totalPrice.toLocaleString("en-IN")}**`);

    if (analysis.issues.length === 0) {
        lines.push("\n✅ No major issues detected! This build looks solid.");
    } else {
        lines.push("\n**Issues Found:**");
        for (const issue of analysis.issues) {
            const icon = issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
            lines.push(`\n${icon} **${issue.title}**`);
            lines.push(`   ${issue.description}`);
            if (issue.suggestion) {
                lines.push(`   💡 ${issue.suggestion}`);
            }
            if (issue.alternativeProduct) {
                lines.push(`   ➡️ Suggested: ${issue.alternativeProduct.name} @ ${formatPrice(issue.alternativeProduct.price)}`);
            }
        }
    }

    return lines.join("\n");
}
