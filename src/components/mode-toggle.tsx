"use client";

import { FlameIcon, HammerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ModeToggleProps {
    mode: "build" | "roast";
    onModeChange: (mode: "build" | "roast") => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
    return (
        <div className="flex items-center rounded-lg border border-border bg-background p-1 shadow-sm">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onModeChange("build")}
                className={cn(
                    "flex-1 gap-2 rounded-md transition-all",
                    mode === "build"
                        ? "bg-primary/20 text-primary shadow-sm hover:bg-primary/25 hover:text-primary"
                        : "text-muted-foreground hover:text-foreground"
                )}
            >
                <HammerIcon className="size-4" />
                <span className="hidden sm:inline">Build Mode</span>
            </Button>
            <div className="h-4 w-px bg-border mx-1" />
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onModeChange("roast")}
                className={cn(
                    "flex-1 gap-2 rounded-md transition-all",
                    mode === "roast"
                        ? "bg-orange-500/20 text-orange-400 shadow-sm hover:bg-orange-500/25 hover:text-orange-300"
                        : "text-muted-foreground hover:text-foreground"
                )}
            >
                <FlameIcon className="size-4" />
                <span className="hidden sm:inline">Roast My Build</span>
            </Button>
        </div>
    );
}
