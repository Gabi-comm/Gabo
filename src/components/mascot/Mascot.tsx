import { AGENTS } from "@/harness/agents";
import { BLUE, EYE, EYE_RECT, HAND, STICKER, bodyRects, type Pose, type Rect } from "./grid";
import { PROPS, type MascotKind, type Px } from "./props";

// Canvas around the 17×14 grid, with room for hats above and held props to the right.
const VB_X = -3.5;
const VB_Y = -6;
const VB_W = 25;
const VB_H = 21;

function rect([x, y, w, h]: Rect | Px, key: number | string, fill: string) {
  return <rect key={key} x={x} y={y} width={w} height={h} fill={fill} />;
}

export interface ArtProps {
  kind?: MascotKind;
  pose?: Pose;
  /** Mirror horizontally (face left). */
  flip?: boolean;
  /** White sticker outline, as in the brand sheet. */
  sticker?: boolean;
}

/** The mascot as an SVG group in grid units (origin = tail's left edge, head's top). Embed inside any SVG. */
export function MascotArt({ kind = "base", pose = "stand", flip = false, sticker = true }: ArtProps) {
  const body = bodyRects(pose);
  const props = PROPS[kind];
  const [hx, hy] = HAND[pose];
  const held = (props.held ?? []).map(([x, y, w, h, c]) => [x + hx, y + hy, w, h, c] as const);
  const outline = [...body, ...(props.head ?? []), ...(props.back ?? []), ...held];
  return (
    <g transform={flip ? "translate(17 0) scale(-1 1)" : undefined}>
      {sticker && (
        <g fill={STICKER} stroke={STICKER} strokeWidth={1.5} strokeLinejoin="round">
          {outline.map((r, i) => rect(r, `s${i}`, STICKER))}
        </g>
      )}
      <g shapeRendering="crispEdges">
        {(props.back ?? []).map((r, i) => rect(r, `b${i}`, r[4]))}
        {body.map((r, i) => rect(r, `m${i}`, BLUE))}
        {rect(EYE_RECT, "eye", EYE)}
        {(props.head ?? []).map((r, i) => rect(r, `h${i}`, r[4]))}
        {held.map((r, i) => rect(r, `p${i}`, r[4]))}
      </g>
    </g>
  );
}

export interface MascotProps extends ArtProps {
  /** Rendered width in px. */
  size?: number;
  title?: string;
  className?: string;
}

export function Mascot({ size = 96, title, className, ...art }: MascotProps) {
  const kind = art.kind ?? "base";
  const label = title ?? (kind === "base" || kind === "studying" ? "Gabo mascot" : AGENTS[kind].name);
  return (
    <svg className={className} width={size} height={(size * VB_H) / VB_W} viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`} role="img" aria-label={label}>
      <title>{label}</title>
      <MascotArt {...art} />
    </svg>
  );
}
