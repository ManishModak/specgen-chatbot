// Product type definitions based on products.json schema

export interface ProductSpecs {
    // Registry metadata (from targeted scraping)
    registry_id?: string;
    registry_family?: string;
    search_term?: string;

    // Canonical/reference metadata
    architecture?: string;
    launch_year?: number;

    // GPU specs
    vram?: string;
    vram_variants?: string[];
    memory_type?: string;
    boost_clock?: string;
    tdp?: string;
    tdp_w?: number;
    tdp_w_variants?: number[];
    memory_bus_bit?: number;
    length_mm?: number;
    ports?: string[];

    // CPU specs
    cores?: number;
    threads?: number;
    p_cores?: number;
    e_cores?: number;
    base_clock?: string;
    cache_l3_mb?: number;
    socket?: string;

    // RAM specs
    capacity?: string;
    type?: string;
    speed?: string;
    latency?: string;
    rgb?: boolean;

    // Motherboard specs
    chipset?: string;
    form_factor?: string;
    ram_slots?: number;
    max_ram?: string;
    wifi?: boolean;

    // PSU specs
    wattage?: number;
    efficiency?: string;
    modular?: string;
    fan_size?: string;

    // Case specs
    max_gpu_length_mm?: number;
    max_cooler_height_mm?: number;
    color?: string;

    // Storage specs
    read_speed?: string;
    write_speed?: string;
    interface?: string;

    // Cooler specs
    height_mm?: number;
    fans?: number;
    tdp_rating?: string;
    socket_support?: string[];
}

export interface Product {
    id: string;
    name: string;
    normalized_name: string;
    category: "GPU" | "CPU" | "RAM" | "Motherboard" | "PSU" | "Case" | "Storage" | "CPU Cooler";
    brand: string;
    price: number;
    currency: "INR";
    retailer: string;
    url: string;
    image?: string;  // Product image from retailer
    stock?: boolean; // Default to true if undefined
    last_scraped: string;
    specs: ProductSpecs;
    use_cases?: string[];  // May be empty from scraped data
    performance_tier?: "budget" | "mid-range" | "high-end";  // Inferred from price if missing
}

export interface ProductEmbedding {
    id: string;
    embedding: number[];
}

// Utility functions
export function formatPrice(price: number): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(price);
}

export function getCategoryIcon(category: Product["category"]): string {
    const icons: Record<Product["category"], string> = {
        GPU: "🎮",
        CPU: "⚡",
        RAM: "💾",
        Motherboard: "🔌",
        PSU: "🔋",
        Case: "📦",
        Storage: "💿",
        "CPU Cooler": "❄️",
    };
    return icons[category] || "🖥️";
}

export function getCategoryColor(category: Product["category"]): string {
    const colors: Record<Product["category"], string> = {
        GPU: "text-green-400",
        CPU: "text-blue-400",
        RAM: "text-purple-400",
        Motherboard: "text-orange-400",
        PSU: "text-yellow-400",
        Case: "text-pink-400",
        Storage: "text-cyan-400",
        "CPU Cooler": "text-sky-400",
    };
    return colors[category] || "text-gray-400";
}
