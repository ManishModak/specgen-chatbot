"use client";

import { ExternalLinkIcon, CheckIcon, XIcon, ImageIcon } from "lucide-react";
import { useState } from "react";
import { Product, getCategoryColor, getCategoryIcon, formatPrice } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProductCardProps {
    product: Product;
    className?: string;
    compact?: boolean; // For inline chat display
    featured?: boolean; // For primary recommendation (larger, more prominent)
}

export function ProductCard({ product, className, compact = false, featured = false }: ProductCardProps) {
    const [imageError, setImageError] = useState(false);

    // Compact version for chat inline display
    if (compact) {
        return (
            <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                    "group flex gap-3 rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
                    className
                )}
            >
                {/* Product Image */}
                <div className="relative size-20 flex-shrink-0 overflow-hidden rounded-lg bg-white/5">
                    {product.image && !imageError ? (
                        <img
                            src={product.image}
                            alt={product.name}
                            className="size-full object-contain p-1"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="size-8 opacity-30" />
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className="flex flex-1 flex-col justify-between min-w-0">
                    <div>
                        <h4 className="line-clamp-2 text-sm font-medium text-white group-hover:text-primary transition-colors">
                            {product.name}
                        </h4>
                        <p className="text-xs text-muted-foreground">{product.retailer}</p>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                        <span className="text-lg font-bold text-primary">{formatPrice(product.price)}</span>
                        {product.stock !== false && (
                            <span className="text-xs text-green-400">In Stock</span>
                        )}
                    </div>
                </div>
            </a>
        );
    }

    // Featured version for primary recommendations (horizontal layout with prominent styling)
    if (featured) {
        return (
            <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                    "group relative flex gap-4 rounded-xl border-2 border-primary/30 bg-gradient-to-r from-primary/10 via-black/40 to-black/40 p-4 backdrop-blur-sm transition-all hover:border-primary/60 hover:shadow-xl hover:shadow-primary/20",
                    className
                )}
            >
                {/* Featured Badge */}
                <div className="absolute -top-2 left-4 z-10">
                    <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground shadow-lg">
                        🎯 Recommended
                    </span>
                </div>

                {/* Product Image */}
                <div className="relative size-28 flex-shrink-0 overflow-hidden rounded-lg bg-white/10 ring-2 ring-primary/20">
                    {product.image && !imageError ? (
                        <img
                            src={product.image}
                            alt={product.name}
                            className="size-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="size-10 opacity-30" />
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className="flex flex-1 flex-col justify-between min-w-0 pt-2">
                    <div>
                        <h3 className="line-clamp-2 text-base font-semibold text-white group-hover:text-primary transition-colors">
                            {product.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5">{product.brand} • {product.retailer}</p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xl font-bold text-primary">{formatPrice(product.price)}</span>
                        <div className="flex items-center gap-2">
                            {product.stock !== false && (
                                <span className="inline-flex items-center rounded-md border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                                    <CheckIcon className="mr-1 size-3" /> In Stock
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                                View Deal <ExternalLinkIcon className="size-3" />
                            </span>
                        </div>
                    </div>
                </div>
            </a>
        );
    }

    // Full card version
    return (
        <div className={cn(
            "group relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
            className
        )}>
            {/* Product Image Section */}
            <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-b from-white/5 to-transparent">
                {product.image && !imageError ? (
                    <img
                        src={product.image}
                        alt={product.name}
                        className="size-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="size-16 opacity-20" />
                    </div>
                )}

                {/* Price Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-4">
                    <span className="text-2xl font-bold text-white drop-shadow-lg">{formatPrice(product.price)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">@ {product.retailer}</span>
                </div>

                {/* Category & Stock Badges */}
                <div className="absolute left-3 top-3 z-10 flex gap-2">
                    <span className={cn(
                        "inline-flex items-center rounded-md border border-white/10 bg-black/60 px-2 py-1 text-xs font-medium backdrop-blur-md",
                        getCategoryColor(product.category)
                    )}>
                        {getCategoryIcon(product.category)} {product.category}
                    </span>
                </div>
                <div className="absolute right-3 top-3 z-10">
                    {product.stock !== false ? (
                        <span className="inline-flex items-center rounded-md border border-green-500/20 bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400 backdrop-blur-md">
                            <CheckIcon className="mr-1 size-3" /> In Stock
                        </span>
                    ) : (
                        <span className="inline-flex items-center rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 backdrop-blur-md">
                            <XIcon className="mr-1 size-3" /> Out of Stock
                        </span>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 flex-col p-4">
                <div className="mb-3">
                    <h3 className="line-clamp-2 font-semibold leading-tight text-white group-hover:text-primary transition-colors">
                        {product.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">{product.brand}</p>
                </div>

                {/* Specs Grid - Only show non-empty meaningful specs */}
                {Object.keys(product.specs).length > 0 && (
                    <div className="mb-4 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {Object.entries(product.specs)
                            .filter(([key]) => !['registry_id', 'registry_family', 'search_term'].includes(key))
                            .slice(0, 4)
                            .map(([key, value]) => (
                                <div key={key} className="flex justify-between border-b border-white/5 py-1">
                                    <span className="capitalize opacity-70">{key.replace(/_/g, " ")}</span>
                                    <span className="font-medium text-white">{String(value)}</span>
                                </div>
                            ))}
                    </div>
                )}

                <div className="mt-auto pt-3">
                    <a href={product.url} target="_blank" rel="noopener noreferrer" className="block">
                        <Button size="sm" className="w-full gap-2 rounded-lg bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground transition-all">
                            Buy @ {product.retailer} <ExternalLinkIcon className="size-3" />
                        </Button>
                    </a>
                </div>
            </div>

            {/* Tier Indicator Strip */}
            <div className={cn(
                "h-1 w-full",
                product.performance_tier === "high-end" ? "bg-purple-500" :
                    product.performance_tier === "mid-range" ? "bg-blue-500" : "bg-green-500"
            )} />
        </div>
    );
}
