"use client";

import { cn } from "@/lib/utils";
import { Product, formatPrice } from "@/lib/products";
import { IssueType } from "@/lib/build-analyzer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertCircle,
    AlertTriangle,
    Info,
    Zap,
    Thermometer,
    HardDrive,
    Cpu,
    Package,
    DollarSign,
    ChevronRight,
} from "lucide-react";
import { memo } from "react";

export interface IssueCardProps {
    type: IssueType;
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    suggestion?: string;
    alternativeProduct?: Product;
    savingsAmount?: number;
    onFixClick?: (product: Product) => void;
    className?: string;
}

const severityStyles = {
    critical: {
        bg: "bg-red-500/10 border-red-500/30",
        icon: "text-red-500",
        badge: "bg-red-500/20 text-red-400 border-red-500/30",
    },
    warning: {
        bg: "bg-yellow-500/10 border-yellow-500/30",
        icon: "text-yellow-500",
        badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    },
    info: {
        bg: "bg-blue-500/10 border-blue-500/30",
        icon: "text-blue-500",
        badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    },
};

const issueIcons: Record<IssueType, typeof AlertCircle> = {
    bottleneck: Zap,
    psu_warning: Zap,
    compatibility: AlertCircle,
    overspending: DollarSign,
    missing: Package,
    ram_compatibility: HardDrive,
    chipset_mismatch: Cpu,
    cooling_inadequate: Thermometer,
    storage_slots: HardDrive,
};

const severityLabels = {
    critical: "Critical",
    warning: "Warning",
    info: "Info",
};

export const IssueCard = memo(function IssueCard({
    type,
    severity,
    title,
    description,
    suggestion,
    alternativeProduct,
    savingsAmount,
    onFixClick,
    className,
}: IssueCardProps) {
    const styles = severityStyles[severity];
    const Icon = issueIcons[type] || AlertCircle;

    return (
        <div
            className={cn(
                "rounded-lg border p-4 transition-all hover:shadow-md",
                styles.bg,
                className
            )}
        >
            {/* Header */}
            <div className="flex items-start gap-3">
                <div className={cn("mt-0.5 shrink-0", styles.icon)}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-foreground">{title}</h4>
                        <Badge
                            variant="outline"
                            className={cn("text-xs", styles.badge)}
                        >
                            {severityLabels[severity]}
                        </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {description}
                    </p>
                </div>
            </div>

            {/* Suggestion */}
            {suggestion && (
                <div className="mt-3 pl-8">
                    <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">💡 Suggestion:</span>{" "}
                        {suggestion}
                    </p>
                </div>
            )}

            {/* Alternative Product */}
            {alternativeProduct && (
                <div className="mt-3 pl-8 flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 rounded-md bg-background/50 px-3 py-2 border">
                        <span className="text-sm text-muted-foreground">Recommended:</span>
                        <span className="text-sm font-medium">
                            {alternativeProduct.name}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                            {formatPrice(alternativeProduct.price)}
                        </Badge>
                        {savingsAmount && savingsAmount > 0 && (
                            <Badge
                                variant="outline"
                                className="text-xs bg-green-500/10 text-green-400 border-green-500/30"
                            >
                                Save ₹{savingsAmount.toLocaleString("en-IN")}
                            </Badge>
                        )}
                    </div>
                    {onFixClick && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onFixClick(alternativeProduct)}
                            className="shrink-0"
                        >
                            Fix This
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
});

/**
 * Container for multiple issue cards
 */
export interface IssueListProps {
    children: React.ReactNode;
    className?: string;
}

export const IssueList = memo(function IssueList({
    children,
    className,
}: IssueListProps) {
    return (
        <div className={cn("space-y-3", className)}>
            {children}
        </div>
    );
});
