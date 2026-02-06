/**
 * SpecGen Chat Logger
 * 
 * Full verbose logging with hybrid format (human headers + JSON data).
 * Keeps last 10 session log files with automatic rotation.
 */

import * as fs from "fs";
import * as path from "path";

// Log levels with priority for filtering
export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR";
const LOG_LEVELS: Record<LogLevel, number> = {
    TRACE: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4,
};

// Categories for organizing logs
export type LogCategory = "API" | "RAG" | "ROAST" | "SYSTEM" | "BUILD";

// Configuration
const MAX_LOG_FILES = 10;
const LOGS_DIR = path.join(process.cwd(), "logs");

/**
 * Generate a short random ID for session identification
 */
function generateSessionId(): string {
    return Math.random().toString(36).substring(2, 9);
}

/**
 * Format timestamp for log entries (HH:mm:ss.SSS)
 */
function formatTime(date: Date): string {
    return date.toTimeString().split(" ")[0] + "." + date.getMilliseconds().toString().padStart(3, "0");
}

/**
 * Format full ISO timestamp
 */
function formatISO(date: Date): string {
    return date.toISOString();
}

/**
 * Safely stringify objects, handling circular references
 */
function safeStringify(obj: unknown, indent = 2): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_, value) => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        // Truncate very long strings
        if (typeof value === "string" && value.length > 10000) {
            return value.substring(0, 10000) + `... [truncated ${value.length - 10000} chars]`;
        }
        return value;
    }, indent);
}

/**
 * FileLogger class - manages session-based log files
 */
class FileLogger {
    private sessionId: string;
    private sessionStart: Date;
    private logFilePath: string | null = null;
    private requestCount = 0;
    private totalTokens = 0;
    private minLevel: LogLevel = "TRACE"; // Log everything by default
    private isInitialized = false;

    constructor() {
        this.sessionId = generateSessionId();
        this.sessionStart = new Date();
    }

    /**
     * Initialize the logger - creates log directory and file
     * Called lazily on first log write (server-side only)
     */
    private initialize(): void {
        if (this.isInitialized) return;

        // Only run on server side
        if (typeof window !== "undefined") {
            this.isInitialized = true;
            return;
        }

        try {
            // Ensure logs directory exists
            if (!fs.existsSync(LOGS_DIR)) {
                fs.mkdirSync(LOGS_DIR, { recursive: true });
            }

            // Generate log filename
            const timestamp = this.sessionStart.toISOString()
                .replace(/[:.]/g, "-")
                .replace("T", "_")
                .substring(0, 19);
            const filename = `session_${timestamp}_${this.sessionId}.log`;
            this.logFilePath = path.join(LOGS_DIR, filename);

            // Create file upfront
            fs.writeFileSync(this.logFilePath, "", { encoding: "utf8" });

            // Cleanup old log files
            this.cleanupOldLogs();

            // Write session header
            this.writeHeader();

            this.isInitialized = true;
        } catch (error) {
            console.error("[Logger] Failed to initialize file logger:", error);
            this.isInitialized = true; // Prevent retry loops
        }
    }

    /**
     * Write session header to log file
     */
    private writeHeader(): void {
        const header = `
====================================================================
SPECGEN CHAT SESSION
Started: ${formatISO(this.sessionStart)}
Session ID: ${this.sessionId}
====================================================================

`;
        this.writeRaw(header);
    }

    /**
     * Write raw content to log file
     */
    private writeRaw(content: string): void {
        if (this.logFilePath) {
            fs.appendFileSync(this.logFilePath, content, { encoding: "utf8" });
        }
        // Also log to console in development
        if (process.env.NODE_ENV === "development") {
            process.stdout.write(content);
        }
    }

    /**
     * Remove old log files, keeping only MAX_LOG_FILES most recent
     */
    private cleanupOldLogs(): void {
        try {
            const files = fs.readdirSync(LOGS_DIR)
                .filter(f => f.startsWith("session_") && f.endsWith(".log"))
                .map(f => ({
                    name: f,
                    path: path.join(LOGS_DIR, f),
                    time: fs.statSync(path.join(LOGS_DIR, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time); // Newest first

            // Delete files beyond MAX_LOG_FILES
            if (files.length > MAX_LOG_FILES) {
                const toDelete = files.slice(MAX_LOG_FILES);
                for (const file of toDelete) {
                    fs.unlinkSync(file.path);
                    console.log(`[Logger] Deleted old log: ${file.name}`);
                }
            }
        } catch (error) {
            console.error("[Logger] Failed to cleanup old logs:", error);
        }
    }

    /**
     * Core logging method
     */
    log(level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>): void {
        // Check log level
        if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) {
            return;
        }

        // Initialize on first use
        this.initialize();

        const now = new Date();
        const time = formatTime(now);

        // Build log entry with hybrid format
        let entry = `--------------------------------------------------------------------\n`;
        entry += `[${time}] [${category}] [${level}] ${message}\n`;

        if (data && Object.keys(data).length > 0) {
            entry += safeStringify(data) + "\n";
        }

        this.writeRaw(entry);
    }

    // Convenience methods for each log level
    trace(category: LogCategory, message: string, data?: Record<string, unknown>): void {
        this.log("TRACE", category, message, data);
    }

    debug(category: LogCategory, message: string, data?: Record<string, unknown>): void {
        this.log("DEBUG", category, message, data);
    }

    info(category: LogCategory, message: string, data?: Record<string, unknown>): void {
        this.log("INFO", category, message, data);
    }

    warn(category: LogCategory, message: string, data?: Record<string, unknown>): void {
        this.log("WARN", category, message, data);
    }

    error(category: LogCategory, message: string, data?: Record<string, unknown>): void {
        this.log("ERROR", category, message, data);
    }

    // ========== Structured Helper Methods ==========

    /**
     * Log incoming chat request
     */
    logRequest(mode: string, messages: unknown[], userQuery: string): void {
        this.requestCount++;
        this.info("API", "New Chat Request", {
            request_number: this.requestCount,
            mode,
            messages_count: messages.length,
            user_query: userQuery,
        });
    }

    /**
     * Log RAG search results
     */
    logRAG(
        searchType: "vector" | "keyword",
        results: Array<{ name: string; price: number }>,
        timeMs: number,
        embeddingDims?: number
    ): void {
        this.debug("RAG", `${searchType === "vector" ? "Vector" : "Keyword"} Search Complete`, {
            search_type: searchType,
            embedding_dims: embeddingDims,
            result_count: results.length,
            search_time_ms: timeMs,
            products: results.map(p => `${p.name} - INR ${p.price.toLocaleString("en-IN")}`),
        });
    }

    /**
     * Log full system prompt (TRACE level for verbose output)
     */
    logSystemPrompt(prompt: string, mode: string, productCount: number): void {
        this.trace("SYSTEM", "Full System Prompt", {
            size_chars: prompt.length,
            mode,
            product_context_count: productCount,
            content: prompt,
        });
    }

    /**
     * Log Gemini API call start
     */
    logAPICallStart(model: string, messageCount: number): void {
        this.info("API", "Gemini API Call Started", {
            model,
            valid_messages: messageCount,
        });
    }

    /**
     * Log API response completion
     */
    logResponse(text: string, usage: Record<string, unknown>, timeMs: number): void {
        // Track total tokens
        const totalTokens = (usage.totalTokens as number) || 0;
        this.totalTokens += totalTokens;

        this.info("API", "Response Complete", {
            response_length: text.length,
            total_time_ms: timeMs,
            tokens: usage,
            preview: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
        });

        // Log full response at TRACE level
        this.trace("API", "Full Response", {
            content: text,
        });
    }

    /**
     * Log roast mode build analysis
     */
    logRoastAnalysis(
        componentsCount: number,
        score: number,
        issuesCount: number,
        analysisContext: string
    ): void {
        this.info("ROAST", "Build Analysis Complete", {
            components_detected: componentsCount,
            overall_score: score,
            issues_found: issuesCount,
        });

        this.trace("ROAST", "Full Analysis Context", {
            content: analysisContext,
        });
    }

    /**
     * Log errors with full stack trace
     */
    logError(error: Error | unknown, context?: string): void {
        const errorData: Record<string, unknown> = {
            context,
        };

        if (error instanceof Error) {
            errorData.name = error.name;
            errorData.message = error.message;
            errorData.stack = error.stack;
        } else {
            errorData.raw = String(error);
        }

        this.error("API", "Error Occurred", errorData);
    }

    /**
     * End the session and write footer
     */
    endSession(): void {
        if (!this.isInitialized) return;

        const duration = (Date.now() - this.sessionStart.getTime()) / 1000;

        const footer = `
====================================================================
SESSION END
Total Requests: ${this.requestCount}
Total Tokens: ${this.totalTokens}
Duration: ${duration.toFixed(1)}s
====================================================================
`;
        this.writeRaw(footer);
    }

    /**
     * Get current log file path
     */
    getLogFilePath(): string | null {
        return this.logFilePath;
    }

    /**
     * Get session ID
     */
    getSessionId(): string {
        return this.sessionId;
    }
}

// Singleton instance - new session per server restart
let loggerInstance: FileLogger | null = null;

/**
 * Get the logger instance (creates one if needed)
 */
export function getLogger(): FileLogger {
    if (!loggerInstance) {
        loggerInstance = new FileLogger();
    }
    return loggerInstance;
}

/**
 * Create a new session (useful for testing or explicit session management)
 */
export function newSession(): FileLogger {
    if (loggerInstance) {
        loggerInstance.endSession();
    }
    loggerInstance = new FileLogger();
    return loggerInstance;
}

// Export singleton for convenience
export const logger = getLogger();
