/**
 * Deterministic campaign artwork.
 *
 * Derived from the campaign id, so every campaign gets a stable identity with
 * no image upload, no storage, and no broken-image state. Decorative only —
 * hidden from assistive tech.
 */

const PALETTES = [
  ["#F59E0B", "#DC2626"],
  ["#10B981", "#0891B2"],
  ["#8B5CF6", "#DB2777"],
  ["#F97316", "#B91C1C"],
  ["#06B6D4", "#4338CA"],
  ["#84CC16", "#059669"],
  ["#EC4899", "#7C3AED"],
  ["#EAB308", "#EA580C"],
];

export function CampaignArt({
  id,
  className = "",
}: {
  id: number;
  className?: string;
}) {
  const [from, to] = PALETTES[id % PALETTES.length];
  const rotation = (id * 37) % 360;
  const cx = 30 + ((id * 17) % 40);
  const cy = 30 + ((id * 23) % 40);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      aria-hidden="true"
      role="presentation"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
      >
        <defs>
          <linearGradient
            id={`lantern-grad-${id}`}
            gradientTransform={`rotate(${rotation} 0.5 0.5)`}
          >
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          <radialGradient id={`lantern-glow-${id}`}>
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#lantern-grad-${id})`} />
        <circle
          cx={cx}
          cy={cy}
          r="34"
          fill={`url(#lantern-glow-${id})`}
        />
      </svg>
    </div>
  );
}
