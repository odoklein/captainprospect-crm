import { brand as defaultBrand, type Brand } from "@/lib/brand";
import { brandCss } from "@/lib/brand/tokens";

/**
 * Injects the brand palette and font preset as CSS variables. Rendered by the
 * root layout, server-side, with the instance brand (getBrand), so there is
 * no flash of the wrong colours. app/globals.css builds everything on top.
 */
export function BrandStyle({ brand = defaultBrand }: { brand?: Brand }) {
    return <style id="brand-tokens" dangerouslySetInnerHTML={{ __html: brandCss(brand) }} />;
}
