import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brand/server";
import { getPublicRuntimeConfig } from "@/lib/runtime-config/server";

// Public (excluded from the auth middleware): the per-instance values the
// browser needs plus the brand. Nothing here is secret.
export const dynamic = "force-dynamic";

export async function GET() {
    const brand = await getBrand();
    return NextResponse.json(
        { ...getPublicRuntimeConfig(brand.appUrl), brand },
        { headers: { "Cache-Control": "public, max-age=60" } },
    );
}
