import * as fs from "fs";
import * as path from "path";

// Registry file paths (JSON format converted from YAML)
const REGISTRY_DIR = path.join(process.cwd(), "..", "specgen-scraper", "scraper-data", "registry_json");

// Cache for loaded registries
let gpuRegistry: any = null;
let cpuRegistry: any = null;
let motherboardRegistry: any = null;

function loadGPURegistry(): any {
    if (gpuRegistry) return gpuRegistry;
    try {
        const filePath = path.join(REGISTRY_DIR, "gpus.json");
        const content = fs.readFileSync(filePath, "utf-8");
        gpuRegistry = JSON.parse(content);
        return gpuRegistry;
    } catch (error) {
        console.error("Failed to load GPU registry:", error);
        return null;
    }
}

function loadCPURegistry(): any {
    if (cpuRegistry) return cpuRegistry;
    try {
        const filePath = path.join(REGISTRY_DIR, "cpus.json");
        const content = fs.readFileSync(filePath, "utf-8");
        cpuRegistry = JSON.parse(content);
        return cpuRegistry;
    } catch (error) {
        console.error("Failed to load CPU registry:", error);
        return null;
    }
}

function loadMotherboardRegistry(): any {
    if (motherboardRegistry) return motherboardRegistry;
    try {
        const filePath = path.join(REGISTRY_DIR, "motherboards.json");
        const content = fs.readFileSync(filePath, "utf-8");
        motherboardRegistry = JSON.parse(content);
        return motherboardRegistry;
    } catch (error) {
        console.error("Failed to load Motherboard registry:", error);
        return null;
    }
}

export function matchGPUFromRegistry(productName: string): { matched: boolean; model?: string; tier?: string; brand?: string } {
    const registry = loadGPURegistry();
    if (!registry) return { matched: false };
    
    const nameLower = productName.toLowerCase();
    
    for (const [brandKey, brandData] of Object.entries(registry.brands || {})) {
        for (const [seriesKey, seriesData] of Object.entries((brandData as any).series || {})) {
            let tier: string = "mid";
            if (seriesKey.includes("rtx_50") || seriesKey.includes("rx_90")) tier = "enthusiast";
            else if (seriesKey.includes("rtx_40") || seriesKey.includes("rx_70")) tier = "high";
            else if (seriesKey.includes("rtx_30") || seriesKey.includes("rx_60")) tier = "mid";
            else if (seriesKey.includes("gtx") || seriesKey.includes("rx_55") || seriesKey.includes("arc_a3")) tier = "entry";
            
            for (const model of (seriesData as any).models || []) {
                for (const term of model.search_terms || []) {
                    if (nameLower.includes(term.toLowerCase())) {
                        return {
                            matched: true,
                            model: `${(seriesData as any).prefix} ${model.name}`,
                            tier,
                            brand: (brandData as any).display_name
                        };
                    }
                }
            }
        }
    }
    
    return { matched: false };
}

export function matchCPUFromRegistry(productName: string): { matched: boolean; model?: string; socket?: string; tier?: string; brand?: string } {
    const registry = loadCPURegistry();
    if (!registry) return { matched: false };
    
    const nameLower = productName.toLowerCase();
    
    for (const [brandKey, brandData] of Object.entries(registry.brands || {})) {
        for (const [seriesKey, seriesData] of Object.entries((brandData as any).series || {})) {
            let tier: string = "mid";
            if (seriesKey.includes("i9") || seriesKey.includes("ryzen_9") || seriesKey.includes("threadripper")) tier = "enthusiast";
            else if (seriesKey.includes("i7") || seriesKey.includes("ryzen_7")) tier = "high";
            else if (seriesKey.includes("i5") || seriesKey.includes("ryzen_5")) tier = "mid";
            else if (seriesKey.includes("i3") || seriesKey.includes("ryzen_3") || seriesKey.includes("athlon")) tier = "entry";
            
            for (const model of (seriesData as any).models || []) {
                for (const term of model.search_terms || []) {
                    if (nameLower.includes(term.toLowerCase())) {
                        return {
                            matched: true,
                            model: `${(seriesData as any).prefix} ${model.name}`,
                            socket: (seriesData as any).socket,
                            tier,
                            brand: (brandData as any).display_name
                        };
                    }
                }
            }
        }
    }
    
    return { matched: false };
}

export function checkCPUMotherboardCompatibility(cpuName: string, motherboardName: string): { compatible: boolean; cpuSocket?: string; motherboardSocket?: string; reason?: string } {
    const cpuMatch = matchCPUFromRegistry(cpuName);
    
    if (!cpuMatch.matched) {
        return { compatible: false, reason: "CPU not recognized in registry" };
    }
    
    const mbRegistry = loadMotherboardRegistry();
    let motherboardSocket: string | null = null;
    const mbLower = motherboardName.toLowerCase();
    
    if (mbRegistry && mbRegistry.platforms) {
        for (const [platformKey, platformData] of Object.entries(mbRegistry.platforms)) {
            for (const chipset of (platformData as any).chipsets || []) {
                if (mbLower.includes(chipset.name.toLowerCase())) {
                    motherboardSocket = (platformData as any).socket;
                    break;
                }
            }
            if (motherboardSocket) break;
        }
    }
    
    if (!motherboardSocket) {
        if (mbLower.includes("z790") || mbLower.includes("b760") || mbLower.includes("h770") || mbLower.includes("z690") || mbLower.includes("b660")) {
            motherboardSocket = "LGA 1700";
        } else if (mbLower.includes("x670") || mbLower.includes("b650") || mbLower.includes("x870")) {
            motherboardSocket = "AM5";
        } else if (mbLower.includes("x570") || mbLower.includes("b550")) {
            motherboardSocket = "AM4";
        }
    }
    
    if (!motherboardSocket) {
        return { compatible: false, reason: "Motherboard socket not determined from registry" };
    }
    
    const compatible = cpuMatch.socket === motherboardSocket;
    
    return {
        compatible,
        cpuSocket: cpuMatch.socket,
        motherboardSocket,
        reason: compatible ? undefined : `Socket mismatch: CPU uses ${cpuMatch.socket}, motherboard is ${motherboardSocket}`
    };
}

export function getGPUGamingTier(productName: string): "entry" | "minimum" | "good" | "high" | "enthusiast" | "unknown" {
    const match = matchGPUFromRegistry(productName);
    if (!match.matched) return "unknown";
    
    switch (match.tier) {
        case "entry": return "minimum";
        case "mid": return "good";
        case "high": return "high";
        case "enthusiast": return "enthusiast";
        default: return "unknown";
    }
}

export function getCPUGamingTier(productName: string): "entry" | "minimum" | "good" | "high" | "enthusiast" | "unknown" {
    const match = matchCPUFromRegistry(productName);
    if (!match.matched) return "unknown";
    
    switch (match.tier) {
        case "entry": return "minimum";
        case "mid": return "good";
        case "high": return "high";
        case "enthusiast": return "enthusiast";
        default: return "unknown";
    }
}

export function isGamingSuitableGPU(productName: string, highPerformance: boolean = false): boolean {
    const tier = getGPUGamingTier(productName);
    if (tier === "unknown") return false;
    if (tier === "minimum" && highPerformance) return false;
    return true;
}

export function isGamingSuitableCPU(productName: string): boolean {
    const tier = getCPUGamingTier(productName);
    return tier !== "unknown" && tier !== "minimum";
}
