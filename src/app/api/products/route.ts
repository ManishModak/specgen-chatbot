import { getAllProducts } from "@/lib/search";
import { NextResponse } from "next/server";

export async function GET() {
    const products = getAllProducts();
    return NextResponse.json(products);
}
