"use client";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { memo, useMemo } from "react";

export interface BuildScoreGaugeProps {
    score: number; // 0-100
    grade?: "S" | "A" | "B" | "C" | "D" | "F";
    className?: string;
    size?: "sm" | "md" | "lg";
    showLabel?: boolean;
}

const gradeColors: Record<string, { bg: string; text: string; ring: string }> = {
    S: { bg: "bg-violet-500/20", text: "text-violet-400", ring: "stroke-violet-500" },
    A: { bg: "bg-green-500/20", text: "text-green-400", ring: "stroke-green-500" },
    B: { bg: "bg-blue-500/20", text: "text-blue-400", ring: "stroke-blue-500" },
    C: { bg: "bg-yellow-500/20", text: "text-yellow-400", ring: "stroke-yellow-500" },
    D: { bg: "bg-orange-500/20", text: "text-orange-400", ring: "stroke-orange-500" },
    F: { bg: "bg-red-500/20", text: "text-red-400", ring: "stroke-red-500" },
};

const sizeClasses = {
    sm: { container: "w-16 h-16", text: "text-lg", grade: "text-xs" },
    md: { container: "w-24 h-24", text: "text-2xl", grade: "text-sm" },
    lg: { container: "w-32 h-32", text: "text-3xl", grade: "text-base" },
};

function calculateGrade(score: number): "S" | "A" | "B" | "C" | "D" | "F" {
    if (score >= 95) return "S";
    if (score >= 85) return "A";
    if (score >= 70) return "B";
    if (score >= 55) return "C";
    if (score >= 40) return "D";
    return "F";
}

export const BuildScoreGauge = memo(function BuildScoreGauge({
    score,
    grade,
    className,
    size = "md",
    showLabel = true,
}: BuildScoreGaugeProps) {
    const finalGrade = grade ?? calculateGrade(score);
    const colors = gradeColors[finalGrade];
    const classes = sizeClasses[size];

    // SVG circle calculations
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;
    const strokeDasharray = `${progress} ${circumference}`;

    const gradeLabel = useMemo(() => {
        switch (finalGrade) {
            case "S": return "Perfect!";
            case "A": return "Excellent";
            case "B": return "Good";
            case "C": return "Fair";
            case "D": return "Needs Work";
            case "F": return "Critical Issues";
            default: return "";
        }
    }, [finalGrade]);

    return (
        <div className={cn("flex flex-col items-center gap-2", className)}>
            <div className={cn("relative", classes.container)}>
                {/* Background ring */}
                <svg
                    className="absolute inset-0 w-full h-full -rotate-90"
                    viewBox="0 0 100 100"
                >
                    <circle
                        className="stroke-muted"
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="none"
                        strokeWidth="8"
                    />
                    {/* Animated progress ring */}
                    <motion.circle
                        className={cn(colors.ring)}
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="none"
                        strokeWidth="8"
                        strokeLinecap="round"
                        initial={{ strokeDasharray: `0 ${circumference}` }}
                        animate={{ strokeDasharray }}
                        transition={{ duration: 1, ease: "easeOut" }}
                    />
                </svg>

                {/* Center content */}
                <div className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center rounded-full",
                    colors.bg
                )}>
                    <motion.span
                        className={cn("font-bold", classes.text, colors.text)}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                    >
                        {finalGrade}
                    </motion.span>
                    <span className={cn("text-muted-foreground", classes.grade)}>
                        {score}%
                    </span>
                </div>
            </div>

            {showLabel && (
                <motion.span
                    className={cn("font-medium text-sm", colors.text)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    {gradeLabel}
                </motion.span>
            )}
        </div>
    );
});
