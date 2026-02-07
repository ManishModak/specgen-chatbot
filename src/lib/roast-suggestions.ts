/**
 * Roast Suggestions - Generate fix suggestions and alternatives for build issues
 */
import { Product, formatPrice } from "./products";
import { BuildAnalysis, AnalysisIssue, IssueType } from "./build-analyzer";
import { ParsedBuild, ParsedComponent } from "./build-parser";
import { getAllProducts, getProductsByCategory } from "./search";

/**
 * Suggested fix for a build issue
 */
export interface RoastSuggestion {
    issueType: IssueType;
    priority: "critical" | "high" | "medium" | "low";
    originalProduct?: Product;
    suggestedProduct?: Product;
    savingsAmount?: number;
    action: "replace" | "add" | "remove" | "upgrade" | "downgrade";
    reason: string;
    detailedExplanation: string;
}

/**
 * Complete roast result with suggestions
 */
export interface RoastResult {
    score: number;
    grade: "S" | "A" | "B" | "C" | "D" | "F";
    suggestions: RoastSuggestion[];
    totalPotentialSavings: number;
    topPriorityFixes: RoastSuggestion[];
    buildSummary: string;
}

/**
 * Generate roast suggestions from build analysis
 */
export function generateRoastSuggestions(
    analysis: BuildAnalysis,
    parsedBuild: ParsedBuild
): RoastResult {
    const allProducts = getAllProducts();
    const suggestions: RoastSuggestion[] = [];
    let totalPotentialSavings = 0;

    // Process each issue and generate suggestions
    for (const issue of analysis.issues) {
        const suggestion = createSuggestionFromIssue(issue, parsedBuild, allProducts);
        if (suggestion) {
            suggestions.push(suggestion);
            if (suggestion.savingsAmount) {
                totalPotentialSavings += suggestion.savingsAmount;
            }
        }
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Get top priority fixes (critical and high only)
    const topPriorityFixes = suggestions.filter(
        s => s.priority === "critical" || s.priority === "high"
    ).slice(0, 3);

    // Calculate grade
    const grade = calculateGrade(analysis.overallScore);

    // Generate build summary
    const buildSummary = generateBuildSummary(analysis, parsedBuild, suggestions);

    return {
        score: analysis.overallScore,
        grade,
        suggestions,
        totalPotentialSavings,
        topPriorityFixes,
        buildSummary,
    };
}

/**
 * Create a suggestion from an analysis issue
 */
function createSuggestionFromIssue(
    issue: AnalysisIssue,
    parsedBuild: ParsedBuild,
    allProducts: Product[]
): RoastSuggestion | null {
    const priority = mapSeverityToPriority(issue.severity);

    switch (issue.type) {
        case "compatibility":
        case "chipset_mismatch":
        case "ram_compatibility":
            return {
                issueType: issue.type,
                priority: "critical",
                suggestedProduct: issue.alternativeProduct,
                action: "replace",
                reason: issue.title,
                detailedExplanation: `${issue.description} ${issue.suggestion || ""}`,
            };

        case "psu_warning":
            return {
                issueType: issue.type,
                priority: "critical",
                suggestedProduct: issue.alternativeProduct,
                action: "upgrade",
                reason: issue.title,
                detailedExplanation: `${issue.description} An underpowered PSU can cause system instability, crashes, and even damage components under heavy load.`,
            };

        case "bottleneck":
            const isGpuBottleneck = issue.description.toLowerCase().includes("gpu");
            return {
                issueType: issue.type,
                priority: "high",
                suggestedProduct: issue.alternativeProduct,
                action: "upgrade",
                reason: issue.title,
                detailedExplanation: `${issue.description} A bottleneck means you're not getting full performance from your ${isGpuBottleneck ? "CPU" : "GPU"}.`,
            };

        case "cooling_inadequate":
            return {
                issueType: issue.type,
                priority: "high",
                suggestedProduct: issue.alternativeProduct,
                action: "add",
                reason: issue.title,
                detailedExplanation: `${issue.description} Inadequate cooling leads to thermal throttling and reduced performance.`,
            };

        case "overspending":
            return {
                issueType: issue.type,
                priority: "low",
                suggestedProduct: issue.alternativeProduct,
                savingsAmount: issue.savingsAmount,
                action: "replace",
                reason: issue.title,
                detailedExplanation: `${issue.description} You can save money without sacrificing performance.`,
            };

        case "missing":
            return {
                issueType: issue.type,
                priority: "medium",
                action: "add",
                reason: issue.title,
                detailedExplanation: `${issue.description} A complete build requires all essential components.`,
            };

        default:
            return {
                issueType: issue.type,
                priority,
                action: "replace",
                reason: issue.title,
                detailedExplanation: issue.description,
            };
    }
}

/**
 * Map severity to priority
 */
function mapSeverityToPriority(severity: AnalysisIssue["severity"]): RoastSuggestion["priority"] {
    switch (severity) {
        case "critical": return "critical";
        case "warning": return "high";
        case "info": return "low";
        default: return "medium";
    }
}

/**
 * Calculate letter grade from score
 */
function calculateGrade(score: number): RoastResult["grade"] {
    if (score >= 95) return "S";
    if (score >= 85) return "A";
    if (score >= 70) return "B";
    if (score >= 55) return "C";
    if (score >= 40) return "D";
    return "F";
}

/**
 * Generate a summary of the build roast
 */
function generateBuildSummary(
    analysis: BuildAnalysis,
    parsedBuild: ParsedBuild,
    suggestions: RoastSuggestion[]
): string {
    const grade = calculateGrade(analysis.overallScore);
    const criticalCount = suggestions.filter(s => s.priority === "critical").length;
    const highCount = suggestions.filter(s => s.priority === "high").length;

    const lines: string[] = [];

    // Grade and score
    lines.push(`**Build Grade: ${grade}** (${analysis.overallScore}/100)`);

    // Component count
    const matchedCount = parsedBuild.components.filter(c => c.matchedProduct).length;
    lines.push(`Detected ${parsedBuild.components.length} components (${matchedCount} matched in database)`);

    // Issue summary
    if (criticalCount > 0) {
        lines.push(`⚠️ ${criticalCount} critical issue${criticalCount > 1 ? "s" : ""} found!`);
    }
    if (highCount > 0) {
        lines.push(`🔶 ${highCount} high-priority fix${highCount > 1 ? "es" : ""} recommended`);
    }

    // Total price
    if (analysis.totalPrice > 0) {
        lines.push(`💰 Total Build Cost: ₹${analysis.totalPrice.toLocaleString("en-IN")}`);
    }

    // Missing components
    if (analysis.missingCategories.length > 0) {
        lines.push(`📦 Missing: ${analysis.missingCategories.join(", ")}`);
    }

    return lines.join("\n");
}

/**
 * Find better alternatives for a product
 */
export function findAlternatives(
    product: Product,
    criteria: "cheaper" | "better" | "similar",
    maxResults: number = 3
): Product[] {
    const allProducts = getAllProducts();
    const sameCategory = allProducts.filter(
        p => p.category === product.category &&
            p.id !== product.id &&
            p.stock !== false
    );

    switch (criteria) {
        case "cheaper":
            return sameCategory
                .filter(p => p.price < product.price && p.performance_tier === product.performance_tier)
                .sort((a, b) => a.price - b.price)
                .slice(0, maxResults);

        case "better":
            return sameCategory
                .filter(p => {
                    const tierOrder = { "budget": 0, "mid-range": 1, "high-end": 2 };
                    const pTier = tierOrder[p.performance_tier as keyof typeof tierOrder] ?? 1;
                    const productTier = tierOrder[product.performance_tier as keyof typeof tierOrder] ?? 1;
                    return pTier > productTier;
                })
                .sort((a, b) => a.price - b.price)
                .slice(0, maxResults);

        case "similar":
            return sameCategory
                .filter(p => {
                    const priceDiff = Math.abs(p.price - product.price) / product.price;
                    return priceDiff <= 0.2 && p.performance_tier === product.performance_tier;
                })
                .slice(0, maxResults);

        default:
            return [];
    }
}

/**
 * Format roast result as context for LLM
 */
export function formatRoastAsContext(roast: RoastResult): string {
    const lines: string[] = [];

    lines.push(roast.buildSummary);
    lines.push("");

    if (roast.topPriorityFixes.length > 0) {
        lines.push("**Priority Fixes:**");
        for (const fix of roast.topPriorityFixes) {
            const icon = fix.priority === "critical" ? "🔴" : "🟠";
            lines.push(`${icon} ${fix.reason}`);
            if (fix.suggestedProduct) {
                lines.push(`   → Consider: ${fix.suggestedProduct.name} @ ${formatPrice(fix.suggestedProduct.price)}`);
            }
        }
    }

    if (roast.totalPotentialSavings > 0) {
        lines.push("");
        lines.push(`💡 Potential Savings: ₹${roast.totalPotentialSavings.toLocaleString("en-IN")}`);
    }

    return lines.join("\n");
}
