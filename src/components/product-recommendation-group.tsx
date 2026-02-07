"use client";

import { Product, getCategoryColor, getCategoryIcon } from "@/lib/products";
import { ProductCard } from "./product-card";
import { cn } from "@/lib/utils";

interface ProductRecommendationGroupProps {
    category: Product["category"];
    primary: Product;
    alternates: Product[];
    className?: string;
}

/**
 * Displays a component recommendation in the primary + alternates layout:
 * - Featured primary card (larger)
 * - Row of up to 3 alternate options (smaller)
 */
export function ProductRecommendationGroup({
    category,
    primary,
    alternates,
    className,
}: ProductRecommendationGroupProps) {
    const categoryLabel = category.toUpperCase();
    const categoryIcon = getCategoryIcon(category);

    return (
        <div className={cn("space-y-3", className)}>
            {/* Category Header */}
            <div className="flex items-center gap-2">
                <div className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider",
                    getCategoryColor(category),
                    "border border-white/10 bg-black/40 backdrop-blur-sm"
                )}>
                    {categoryIcon && <span className="text-sm">{categoryIcon}</span>}
                    {categoryLabel}
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />
            </div>

            {/* Primary Recommendation */}
            <div className="relative">
                <div className="absolute -left-2 top-0 bottom-0 w-1 rounded-full bg-primary/60" />
                <ProductCard product={primary} featured className="ml-1" />
            </div>

            {/* Alternates Section */}
            {alternates.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pl-1">
                        Alternatives
                    </p>
                    <div className={cn(
                        "grid gap-2",
                        alternates.length === 1 && "grid-cols-1",
                        alternates.length === 2 && "grid-cols-1 sm:grid-cols-2",
                        alternates.length >= 3 && "grid-cols-1 sm:grid-cols-3"
                    )}>
                        {alternates.slice(0, 3).map((product, index) => (
                            <ProductCard
                                key={product.id || index}
                                product={product}
                                compact
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
