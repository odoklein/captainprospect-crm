"use client";

export function Skeleton({
  w,
  h,
  r = 8,
}: {
  w: string | number;
  h: string | number;
  r?: number;
}) {
  return (
    <div
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: typeof h === "number" ? `${h}px` : h,
        borderRadius: r,
        background:
          "linear-gradient(90deg, var(--surface3) 25%, var(--surface2) 50%, var(--surface3) 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
      }}
    />
  );
}
