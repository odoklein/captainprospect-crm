"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import type { SiteImage } from "@/content/images";
import { cx } from "./primitives";

/**
 * Rounded photo "frame" with grain. Anything passed as children floats above the photo.
 * If a placeholder photo fails to load, the frame keeps its warm gradient instead of a broken image.
 */
export function PhotoFrame({
  image,
  children,
  className,
  imgClassName,
  sizes = "100vw",
  priority = false,
  overlay,
}: {
  image: (SiteImage & { position?: string }) | null;
  children?: ReactNode;
  className?: string;
  imgClassName?: string;
  sizes?: string;
  priority?: boolean;
  /** Extra layer between the photo and the children (tint, dark veil…). */
  overlay?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={cx(
        "grain relative overflow-hidden bg-[radial-gradient(120%_90%_at_20%_10%,#d9d2c3_0%,#a9b3a0_45%,#55634f_100%)]",
        className,
      )}
    >
      {image && !failed ? (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          className={cx("object-cover", imgClassName)}
          style={image.position ? { objectPosition: image.position } : undefined}
          onError={() => setFailed(true)}
        />
      ) : null}
      {overlay}
      {children ? <div className="relative z-[2] h-full">{children}</div> : null}
    </div>
  );
}
