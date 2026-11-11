import Image from "next/image";
import { brandLogo, type Brand } from "@/content/brands";
import { cx } from "./primitives";

/** A brand's square logo (from /public/logos), or its initial when no logo exists. Decorative: the name is always shown next to it. */
export function BrandMark({ brand, size = 32, className }: { brand: Brand; size?: number; className?: string }) {
  const src = brandLogo(brand);
  if (!src) {
    return (
      <span
        aria-hidden
        className={cx("grid shrink-0 place-items-center rounded-[10px] border border-current/25 font-display-tight font-normal", className)}
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        {brand.name.charAt(0)}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={cx("shrink-0 rounded-[10px] object-contain", className)}
      loading="lazy"
    />
  );
}
