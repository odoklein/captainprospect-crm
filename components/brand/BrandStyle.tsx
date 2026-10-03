import { brandCss } from "@/lib/brand/tokens";

/**
 * Injects the brand palette (brand/brand.config.ts → lib/brand/color.ts) as
 * CSS variables. Rendered once by the root layout, server-side, so there is
 * no flash of the wrong colours. app/globals.css builds everything on top.
 */
export function BrandStyle() {
    return <style id="brand-tokens" dangerouslySetInnerHTML={{ __html: brandCss() }} />;
}
