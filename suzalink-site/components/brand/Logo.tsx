// Suzalink logo: the brand files in public/brand.
//   logo.png          dark teal + mint sparks, for light backgrounds
//   logo-inverse.png  mint + yellow sparks, for dark backgrounds
import Image from "next/image";

type LogoProps = {
  /** "navy" on light backgrounds, "white" on dark ones (names kept from the previous logo). */
  tone?: "navy" | "white";
  className?: string;
  /** Accessible name. Pass an empty string when the logo sits next to visible text that already names it. */
  title?: string;
};

export function Logo({ tone = "navy", className, title = "Suzalink" }: LogoProps) {
  return (
    <Image
      src={tone === "white" ? "/brand/logo-inverse.png" : "/brand/logo.png"}
      alt={title}
      width={970}
      height={668}
      className={className}
      priority
    />
  );
}
