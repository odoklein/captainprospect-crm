// Small stroke icon set (24px grid, 1.6 stroke). Decorative by default.
const paths = {
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowUpRight: "M7 17 17 7M8 7h9v9",
  check: "M5 12.5 10 17.5 19 7",
  phone:
    "M5 4h3.5l1.8 4.4-2.3 1.5a11 11 0 0 0 6.1 6.1l1.5-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  shield: "M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z M9 12l2 2 4-4",
  database:
    "M4.5 6c0-1.7 3.4-3 7.5-3s7.5 1.3 7.5 3-3.4 3-7.5 3-7.5-1.3-7.5-3Zm0 0v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  play: "M8 5.5v13l10.5-6.5L8 5.5Z",
  mail: "M3.5 6h17v12h-17zM3.5 6.5l8.5 6.5 8.5-6.5",
  alert: "M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17h.01",
  sun: "M12 4V2.5M12 21.5V20M4 12H2.5M21.5 12H20M6.3 6.3 5.2 5.2M18.8 18.8l-1.1-1.1M6.3 17.7l-1.1 1.1M18.8 5.2l-1.1 1.1M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.7 3.2 2.5 3.5 5.2",
  chart: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3",
  linkedin:
    "M4.5 9.5h3v10h-3zM6 4.2a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4ZM10.5 9.5h2.9v1.4c.5-.9 1.6-1.6 3.2-1.6 3 0 3.9 1.8 3.9 4.6v5.6h-3v-5c0-1.3-.3-2.4-1.7-2.4-1.5 0-2.3 1-2.3 2.6v4.8h-3z",
  youtube:
    "M21 8.2a2.6 2.6 0 0 0-1.8-1.8C17.6 6 12 6 12 6s-5.6 0-7.2.4A2.6 2.6 0 0 0 3 8.2 27 27 0 0 0 2.6 12a27 27 0 0 0 .4 3.8 2.6 2.6 0 0 0 1.8 1.8C6.4 18 12 18 12 18s5.6 0 7.2-.4a2.6 2.6 0 0 0 1.8-1.8 27 27 0 0 0 .4-3.8 27 27 0 0 0-.4-3.8ZM10.2 14.6V9.4L14.8 12l-4.6 2.6Z",
  waveform: "M4 10v4M7 7v10M10 9v6M13 5v14M16 8v8M19 10v4",
  building: "M4 21V6l8-3 8 3v15M2.5 21h19M9 21v-4h6v4M8 9h2M14 9h2M8 13h2M14 13h2",
  book: "M5 4.5h9.5A4.5 4.5 0 0 1 19 9v11H9.5A4.5 4.5 0 0 1 5 15.5v-11ZM5 15.5A4.5 4.5 0 0 1 9.5 11H19",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12h.01",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14",
  tooth: "M7.5 3.5c-2.4 0-4 1.9-4 4.4 0 2.9 1.4 4.8 1.9 7.7.4 2.3 1 5 2.4 5 1.2 0 1.5-2.3 1.9-4.2.3-1.2.8-1.9 2.3-1.9s2 .7 2.3 1.9c.4 1.9.7 4.2 1.9 4.2 1.4 0 2-2.7 2.4-5 .5-2.9 1.9-4.8 1.9-7.7 0-2.5-1.6-4.4-4-4.4-1.9 0-2.8.9-4.5.9s-2.6-.9-4.5-.9Z",
  briefcase: "M3.5 8h17v11.5h-17zM8.5 8V5.5h7V8M3.5 13h17",
  grid: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z",
  calendar: "M3.5 5.5h17v15h-17zM8 3v4M16 3v4M3.5 10h17",
} as const;

export type IconName = keyof typeof paths;

const filled = new Set<IconName>(["play", "linkedin", "youtube"]);

export function Icon({
  name,
  className = "size-5",
  title,
}: {
  name: IconName;
  className?: string;
  /** Give a title only when the icon carries meaning on its own. */
  title?: string;
}) {
  const isFilled = filled.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={isFilled ? "currentColor" : "none"}
      stroke={isFilled ? "none" : "currentColor"}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={paths[name]} fillRule={isFilled ? "evenodd" : undefined} />
    </svg>
  );
}
