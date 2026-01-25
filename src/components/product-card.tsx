import { ExternalLinkIcon, CheckIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { Product, getCategoryColor, getCategoryIcon, formatPrice } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProductCardProps {
    product: Product;
    className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
    // Mock image based on category for now, in real app would use product image
    const categoryHash = product.category.toLowerCase().replace(" ", "-");

    return (
        <div className={cn(
            "group relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
            className
        )}>
            {/* Header / Badge */}
            <div className="absolute left-3 top-3 z-10 flex gap-2">
                <span className={cn(
                    "inline-flex items-center rounded-md border border-white/10 bg-black/60 px-2 py-1 text-xs font-medium backdrop-blur-md",
                    getCategoryColor(product.category)
                )}>
                    {getCategoryIcon(product.category)} {product.category}
                </span>
                {product.stock ? (
                    <span className="inline-flex items-center rounded-md border border-green-500/20 bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400 backdrop-blur-md">
                        <CheckIcon className="mr-1 size-3" /> In Stock
                    </span>
                ) : (
                    <span className="inline-flex items-center rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 backdrop-blur-md">
                        <XIcon className="mr-1 size-3" /> Out of Stock
                    </span>
                )}
            </div>

            {/* Main Content */}
            <div className="flex flex-1 flex-col p-4 pt-12">
                <div className="mb-2">
                    <h3 className="line-clamp-2 font-semibold leading-tight text-white group-hover:text-primary transition-colors">
                        {product.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">{product.brand}</p>
                </div>

                {/* Specs Grid */}
                <div className="mb-4 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {Object.entries(product.specs).slice(0, 4).map(([key, value]) => (
                        <div key={key} className="flex justify-between border-b border-white/5 py-1">
                            <span className="capitalize opacity-70">{key.replace(/_/g, " ")}</span>
                            <span className="font-medium text-white">{String(value)}</span>
                        </div>
                    ))}
                </div>

                <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">Best Price</span>
                        <span className="text-lg font-bold text-white">{formatPrice(product.price)}</span>
                    </div>
                    <a href={product.url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="gap-2 rounded-lg bg-white/10 text-white hover:bg-primary hover:text-primary-foreground transition-all">
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
