/**
 * Build Analyzer - Detect issues, bottlenecks, and suggest alternatives
 */
import { Product, formatPrice } from "./products";
import { ParsedBuild, ParsedComponent } from "./build-parser";
import { getAllProducts, getProductsByCategory } from "./search";

export interface AnalysisIssue {
    type: "bottleneck" | "psu_warning" | "compatibility" | "overspending" | "missing";
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    suggestion?: string;
    alternativeProduct?: Product;
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
        const cpuTier = TIER_SCORES[cpu.performance_tier] || 2;
        const gpuTier = TIER_SCORES[gpu.performance_tier] || 2;

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
