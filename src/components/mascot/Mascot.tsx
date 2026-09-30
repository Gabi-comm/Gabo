import { AGENTS } from "@/harness/agents";
import { BLUE, EYE, EYE_RECT, HAND, STICKER, bodyRects, type Pose, type Rect } from "./grid";
import { PROPS, type MascotKind, type Px } from "./props";

// Canvas around the 17×14 grid, with room for hats above and held props to the right.
const VB_X = -4;
const VB_Y = -6.5;
const VB_W = 27;
const VB_H = 22;
/** Where hats pivot when they tip on hover: the top middle of the head. */
const HEAD_PIVOT: readonly [number, number] = [13, 0];

function rect([x, y, w, h]: Rect | Px, key: number | string, fill: string) {
  return <rect key={key} x={x} y={y} width={w} height={h} fill={fill} />;
}

/** White sticker outline, as in the brand sheet: the same rects stroked white with round joins. */
function Sticker({ rects }: { rects: (Rect | Px)[] }) {
  return (
    <g fill={STICKER} stroke={STICKER} strokeWidth={1.5} strokeLinejoin="round">
      {rects.map((r, i) => rect(r, i, STICKER))}
    </g>
  );
}

function Fills({ rects, prefix }: { rects: Px[]; prefix: string }) {
  return <>{rects.map((r, i) => rect(r, `${prefix}${i}`, r[4]))}</>;
}

export interface ArtProps {
  kind?: MascotKind;
  pose?: Pose;
  /** Mirror horizontally (face left). */
  flip?: boolean;
  /** White sticker outline, as in the brand sheet. */
  sticker?: boolean;
}

/**
 * The mascot as an SVG group in grid units (origin = tail's left edge, head's top). Embed inside any SVG.
 * `.m-hat` and `.m-held` are wrapped so that 0,0 is their pivot (head top / the hand); the hover
 * animations in mascot.css rotate and move them around that point.
 */
export function MascotArt({ kind = "base", pose = "stand", flip = false, sticker = true }: ArtProps) {
  const body = bodyRects(pose);
  const p = PROPS[kind];
  const [hx, hy] = HAND[pose];
  const [px, py] = HEAD_PIVOT;
  const head = (p.head ?? []).map(([x, y, w, h, c]) => [x - px, y - py, w, h, c] as const);

  return (
    <g className="m-root" transform={flip ? "translate(17 0) scale(-1 1)" : undefined}>
      <g className="m-bob">
        {sticker && <Sticker rects={[...body, ...(p.back ?? []), ...(p.front ?? [])]} />}
        <g shapeRendering="crispEdges">
          <Fills rects={p.back ?? []} prefix="b" />
          {body.map((r, i) => rect(r, `m${i}`, BLUE))}
          <Fills rects={p.front ?? []} prefix="f" />
          <g className="m-eye">{rect(EYE_RECT, "eye", EYE)}</g>
          <g className="m-face"><Fills rects={p.face ?? []} prefix="c" /></g>
        </g>
        {head.length > 0 && (
          <g transform={`translate(${px} ${py})`}>
            <g className="m-hat">
              {sticker && <Sticker rects={head} />}
              <g shapeRendering="crispEdges"><Fills rects={head} prefix="h" /></g>
            </g>
          </g>
        )}
        {(p.held?.length ?? 0) > 0 && (
          <g transform={`translate(${hx} ${hy})`}>
            <g className="m-held">
              {sticker && <Sticker rects={p.held!} />}
              <g shapeRendering="crispEdges"><Fills rects={p.held!} prefix="p" /></g>
            </g>
          </g>
        )}
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

/** A standalone mascot. It plays its role's animation when hovered, or when a link/button around it is. */
export function Mascot({ size = 96, title, className, ...art }: MascotProps) {
  const kind = art.kind ?? "base";
  const label = title ?? (kind === "base" || kind === "studying" ? "Gabo mascot" : AGENTS[kind].name);
  return (
    <svg
      className={`mascot${className ? ` ${className}` : ""}`}
      data-kind={kind}
      width={size}
      height={(size * VB_H) / VB_W}
      viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <MascotArt {...art} />
    </svg>
  );
}
