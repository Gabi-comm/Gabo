// Small line icons (no emoji, no icon font). 16px, stroke uses currentColor.
const PATHS = {
  plus: "M8 3v10M3 8h10",
  home: "M2.5 7.5 8 3l5.5 4.5V13H10V9.5H6V13H2.5z",
  agents: "M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM11 7.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM1.8 13c.3-2.2 1.8-3.5 3.7-3.5s3.4 1.3 3.7 3.5M9.6 9.7c.4-.2.9-.3 1.4-.3 1.6 0 2.8 1.1 3 3.1",
  library: "M3 2.5h3v11H3zM7 2.5h3v11H7zM11 3.2l2.6-.6 2 10.6-2.6.5z",
  arena: "M3 13 11 5M11 5V2.5M11 5h2.5M13 13 5 5M5 5V2.5M5 5H2.5",
  hackathon: "M2.5 4h11v6.5h-11zM1.5 12.5h13M6 7.2 4.8 8.3 6 9.4M10 7.2l1.2 1.1L10 9.4",
  menu: "M2.5 4.5h11M2.5 8h11M2.5 11.5h11",
  close: "M4 4l8 8M12 4l-8 8",
  chevron: "M6 4l4 4-4 4",
  folder: "M2 4.5h4.2l1.3 1.5H14V12.5H2z",
  trash: "M3.5 5h9M6.5 5V3.5h3V5M4.5 5l.6 8h5.8l.6-8",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
