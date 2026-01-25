// Product type definitions based on products.json schema

export interface ProductSpecs {
    // GPU specs
    vram?: string;
    boost_clock?: string;
    tdp?: string;
    length_mm?: number;
    ports?: string[];

    // CPU specs
    cores?: number;
    threads?: number;
    base_clock?: string;
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
    stock: boolean;
    last_scraped: string;
    specs: ProductSpecs;
    use_cases: string[];
    performance_tier: "budget" | "mid-range" | "high-end";
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
