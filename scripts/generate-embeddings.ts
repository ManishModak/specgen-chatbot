/**
 * Optimized product embeddings generator for hackathon flow.
 * - Incremental (reuse unchanged vectors by hash)
 * - Concurrent workers
 * - Retry with backoff on transient errors
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const PRODUCTS_PATH = path.join(__dirname, "..", "data", "products.json");
const EMBEDDINGS_PATH = path.join(__dirname, "..", "data", "embeddings.json");

const DEFAULT_MODELS = ["gemini-embedding-001", "text-embedding-004"];
const CONCURRENCY = Number.parseInt(process.env.EMBED_CONCURRENCY || "1", 10);
const MAX_RETRIES = Number.parseInt(process.env.EMBED_MAX_RETRIES || "4", 10);
const LOG_VECTORS = (process.env.EMBED_LOG_VECTORS || "false").toLowerCase() === "true";
const REQUEST_GAP_MS = Number.parseInt(process.env.EMBED_REQUEST_GAP_MS || "300", 10);
const CHECKPOINT_EVERY = Number.parseInt(process.env.EMBED_CHECKPOINT_EVERY || "25", 10);
const EMBED_PROVIDER = (process.env.EMBED_PROVIDER || "ollama").toLowerCase();
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

interface Product {
    id: string;
    name: string;
    normalized_name?: string;
    category: string;
    brand?: string;
    use_cases?: string[];
    specs?: Record<string, unknown>;
}

interface EmbeddingEntry {
    id: string;
    text: string;
    vector: number[];
    hash?: string;
}

interface EmbeddingsFile {
    model: string;
    dimension: number;
    generated_at: string;
    embeddings: EmbeddingEntry[];
    stats?: {
        total_products: number;
        reused: number;
        generated: number;
        failed: number;
    };
}

interface EmbedJob {
    product: Product;
    text: string;
    hash: string;
}

interface ApiClient {
    key: string;
    keyMask: string;
    genAI: GoogleGenerativeAI;
}

let nextClientCursor = 0;
let lastRequestAt = 0;

function loadEnvLocal(): void {
    const envPath = path.join(__dirname, "..", ".env.local");
    if (!fs.existsSync(envPath)) return;

    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (!match) continue;
        const [, key, value] = match;
        process.env[key.trim()] = value.trim();
    }
}

function pickSpecs(product: Product, limit: number = 6): string {
    const specs = product.specs || {};
    const priority: Record<string, string[]> = {
        GPU: ["chipset", "vram", "memory_type", "tdp_w"],
        CPU: ["socket", "cores", "threads", "boost_clock"],
        RAM: ["capacity", "type", "speed"],
        Motherboard: ["chipset", "socket", "form_factor"],
        Storage: ["capacity", "interface", "read_speed", "write_speed"],
        PSU: ["wattage", "efficiency", "modular"],
        Case: ["form_factor", "max_gpu_length_mm"],
        "CPU Cooler": ["cooler_type", "height_mm", "radiator_size_mm"],
    };

    const ordered = priority[product.category] || [];
    const seen = new Set<string>();
    const out: Array<[string, unknown]> = [];

    for (const key of ordered) {
        const value = specs[key];
        if (value === undefined || value === null) continue;
        out.push([key, value]);
        seen.add(key);
        if (out.length >= limit) break;
    }

    if (out.length < limit) {
        for (const [key, value] of Object.entries(specs)) {
            if (out.length >= limit) break;
            if (seen.has(key)) continue;
            if (value === undefined || value === null) continue;
            out.push([key, value]);
        }
    }

    return out
        .map(([k, v]) => `${k}:${Array.isArray(v) ? v.join("/") : String(v)}`)
        .join(" ");
}

function buildProductText(product: Product): string {
    const parts = [
        `name:${product.name}`,
        `model:${product.normalized_name || ""}`,
        `category:${product.category}`,
        `brand:${product.brand || ""}`,
        `use_cases:${(product.use_cases || []).slice(0, 4).join("/")}`,
        `specs:${pickSpecs(product)}`,
    ].filter(Boolean);

    return parts.join(" | ");
}

function hashText(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

function vectorFingerprint(vector: number[]): string {
    const preview = vector.slice(0, 12).map((v) => v.toFixed(6)).join("|");
    return createHash("sha256").update(preview).digest("hex").slice(0, 16);
}

function getModelCandidates(): string[] {
    const fromEnv = (process.env.EMBEDDING_MODELS || "").trim();
    if (!fromEnv) return DEFAULT_MODELS;
    return fromEnv.split(",").map((m) => m.trim()).filter(Boolean);
}

function getApiKeys(): string[] {
    const listKeys = (process.env.GOOGLE_GENERATIVE_AI_API_KEYS || "")
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean);

    const singleKey = (process.env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
    const all = [...listKeys, ...(singleKey ? [singleKey] : [])];
    return Array.from(new Set(all));
}

function maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) return "****";
    return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function buildApiClients(apiKeys: string[]): ApiClient[] {
    return apiKeys.map((key) => ({
        key,
        keyMask: maskApiKey(key),
        genAI: new GoogleGenerativeAI(key),
    }));
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickNextClient(clients: ApiClient[]): ApiClient {
    const client = clients[nextClientCursor % clients.length];
    nextClientCursor += 1;
    return client;
}

async function throttleRequestStart(): Promise<void> {
    const now = Date.now();
    const wait = REQUEST_GAP_MS - (now - lastRequestAt);
    if (wait > 0) {
        await sleep(wait);
    }
    lastRequestAt = Date.now();
}

function isRetryable(error: unknown): boolean {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
        msg.includes("429") ||
        msg.includes("rate") ||
        msg.includes("quota") ||
        msg.includes("resource_exhausted") ||
        msg.includes("timeout") ||
        msg.includes("503") ||
        msg.includes("504")
    );
}

async function embedWithOllama(text: string): Promise<number[]> {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama embeddings failed (${response.status}): ${body}`);
    }

    const payload = await response.json() as { embedding?: number[] };
    if (!payload.embedding || !Array.isArray(payload.embedding) || payload.embedding.length === 0) {
        throw new Error("Ollama returned empty embedding");
    }

    return payload.embedding;
}

async function embedWithRetryOllama(text: string): Promise<number[]> {
    let attempt = 0;
    while (true) {
        attempt += 1;
        try {
            await throttleRequestStart();
            return await embedWithOllama(text);
        } catch (error) {
            if (attempt > MAX_RETRIES || !isRetryable(error)) {
                throw error;
            }

            console.warn(`   ⚠️ Retry ${attempt}/${MAX_RETRIES} on ollama (${OLLAMA_EMBED_MODEL}) due to: ${error}`);
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000) + Math.floor(Math.random() * 300);
            await sleep(backoffMs);
        }
    }
}

async function embedWithRetry(
    clients: ApiClient[],
    modelName: string,
    text: string,
    startClientIndex: number = 0
): Promise<number[]> {
    let attempt = 0;
    while (true) {
        attempt += 1;
        const clientIndex = (startClientIndex + attempt - 1) % clients.length;
        const client = clients[clientIndex];

        try {
            await throttleRequestStart();
            const model = client.genAI.getGenerativeModel({ model: modelName });
            const result = await model.embedContent(text);
            return result.embedding.values;
        } catch (error) {
            if (attempt > MAX_RETRIES || !isRetryable(error)) {
                throw error;
            }

            console.warn(
                `   ⚠️ Retry ${attempt}/${MAX_RETRIES} on ${client.keyMask} (${modelName}) due to: ${error}`
            );
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000) + Math.floor(Math.random() * 300);
            await sleep(backoffMs);
        }
    }
}

async function resolveWorkingModel(clients: ApiClient[]): Promise<{ model: string; dimension: number }> {
    const candidates = getModelCandidates();
    for (const model of candidates) {
        for (let i = 0; i < clients.length; i++) {
            try {
                const vector = await embedWithRetry(clients, model, "specgen model probe", i);
                console.log(`✅ Using embedding model: ${model} (${vector.length} dims) via ${clients[i].keyMask}`);
                return { model, dimension: vector.length };
            } catch (error) {
                console.warn(`⚠️ Model probe failed for ${model} on ${clients[i].keyMask}: ${error}`);
            }
        }
    }
    throw new Error(`No embedding model available. Tried: ${candidates.join(", ")}`);
}

async function resolveWorkingOllamaModel(): Promise<{ model: string; dimension: number }> {
    const vector = await embedWithRetryOllama("specgen model probe");
    console.log(`✅ Using Ollama embedding model: ${OLLAMA_EMBED_MODEL} (${vector.length} dims)`);
    return { model: `ollama:${OLLAMA_EMBED_MODEL}`, dimension: vector.length };
}

function loadExistingEmbeddings(): EmbeddingsFile | null {
    if (!fs.existsSync(EMBEDDINGS_PATH)) return null;
    try {
        const raw = fs.readFileSync(EMBEDDINGS_PATH, "utf-8");
        return JSON.parse(raw) as EmbeddingsFile;
    } catch {
        return null;
    }
}

function saveEmbeddings(file: EmbeddingsFile): void {
    fs.writeFileSync(EMBEDDINGS_PATH, JSON.stringify(file, null, 2));
}

function buildSnapshotInProductOrder(
    products: Product[],
    byId: Map<string, EmbeddingEntry>
): EmbeddingEntry[] {
    const snapshot: EmbeddingEntry[] = [];
    for (const product of products) {
        const entry = byId.get(product.id);
        if (entry) snapshot.push(entry);
    }
    return snapshot;
}

async function main(): Promise<void> {
    loadEnvLocal();

    let clients: ApiClient[] = [];
    let modelInfo: { model: string; dimension: number };

    if (EMBED_PROVIDER === "ollama") {
        console.log(`🧠 Embedding provider: ollama (${OLLAMA_BASE_URL})`);
        modelInfo = await resolveWorkingOllamaModel();
    } else {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) {
            console.error("❌ Missing GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEYS in .env.local");
            process.exit(1);
        }

        clients = buildApiClients(apiKeys);
        console.log(`🔑 Loaded ${clients.length} API key(s): ${clients.map((c) => c.keyMask).join(", ")}`);
        modelInfo = await resolveWorkingModel(clients);
    }

    const products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf-8")) as Product[];
    console.log(`📦 Loaded ${products.length} products`);

    const existing = loadExistingEmbeddings();
    const canReuseExisting =
        existing?.model === modelInfo.model &&
        existing?.dimension === modelInfo.dimension;

    const existingById = new Map<string, EmbeddingEntry>();
    if (canReuseExisting && existing) {
        for (const entry of existing.embeddings) {
            existingById.set(entry.id, entry);
        }
    }

    if (existing && !canReuseExisting) {
        console.log(
            `ℹ️ Existing embeddings not reusable (found ${existing.model}/${existing.dimension}, using ${modelInfo.model}/${modelInfo.dimension})`
        );
    }

    const outputById = new Map<string, EmbeddingEntry>();
    const jobs: EmbedJob[] = [];
    let reused = 0;

    for (const product of products) {
        const text = buildProductText(product);
        const hash = hashText(text);
        const prev = existingById.get(product.id);

        if (prev && prev.hash === hash && prev.vector.length === modelInfo.dimension) {
            outputById.set(product.id, prev);
            reused += 1;
            continue;
        }

        jobs.push({ product, text, hash });
    }

    console.log(`♻️ Reused: ${reused}`);
    console.log(`🆕 To generate: ${jobs.length}`);
    console.log(`⚙️ Concurrency: ${CONCURRENCY}`);

    let generated = 0;
    let failed = 0;
    let cursor = 0;
    const progressStep = Math.max(10, Math.floor(jobs.length / 20));

    async function worker(): Promise<void> {
        while (true) {
            const idx = cursor;
            cursor += 1;
            if (idx >= jobs.length) return;

            const job = jobs[idx];
            try {
                const vector = EMBED_PROVIDER === "ollama"
                    ? await embedWithRetryOllama(job.text)
                    : await (() => {
                        const primaryClient = pickNextClient(clients);
                        const primaryClientIndex = clients.findIndex((c) => c.key === primaryClient.key);
                        return embedWithRetry(clients, modelInfo.model, job.text, primaryClientIndex);
                    })();
                outputById.set(job.product.id, {
                    id: job.product.id,
                    text: job.text,
                    vector,
                    hash: job.hash,
                });
                generated += 1;

                if (LOG_VECTORS) {
                    console.log(
                        `   vec ${job.product.id} dims=${vector.length} fp=${vectorFingerprint(vector)} preview=${JSON.stringify(vector.slice(0, 8))}`
                    );
                }

                if (generated % progressStep === 0 || generated === jobs.length) {
                    console.log(`   progress: ${generated}/${jobs.length}`);
                }

                if (CHECKPOINT_EVERY > 0 && generated % CHECKPOINT_EVERY === 0) {
                    const checkpointEmbeddings = buildSnapshotInProductOrder(products, outputById);
                    saveEmbeddings({
                        model: modelInfo.model,
                        dimension: modelInfo.dimension,
                        generated_at: new Date().toISOString(),
                        embeddings: checkpointEmbeddings,
                        stats: {
                            total_products: products.length,
                            reused,
                            generated,
                            failed,
                        },
                    });
                    console.log(`   checkpoint saved (${checkpointEmbeddings.length} vectors)`);
                }
            } catch (error) {
                failed += 1;
                console.error(`❌ Failed: ${job.product.id} (${job.product.name}) -> ${error}`);
            }
        }
    }

    const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, () => worker());
    await Promise.all(workers);

    const embeddings = buildSnapshotInProductOrder(products, outputById);

    const output: EmbeddingsFile = {
        model: modelInfo.model,
        dimension: modelInfo.dimension,
        generated_at: new Date().toISOString(),
        embeddings,
        stats: {
            total_products: products.length,
            reused,
            generated,
            failed,
        },
    };

    saveEmbeddings(output);

    console.log("\n✅ Embedding generation complete");
    console.log(`   Model: ${output.model}`);
    console.log(`   Dimension: ${output.dimension}`);
    console.log(`   Saved vectors: ${output.embeddings.length}`);
    console.log(`   Reused: ${reused} | Generated: ${generated} | Failed: ${failed}`);
    console.log(`   Output: ${EMBEDDINGS_PATH}`);
}

main().catch((error) => {
    console.error("❌ Embedding generation failed:", error);
    process.exit(1);
});
