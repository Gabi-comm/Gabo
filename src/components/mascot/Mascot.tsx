import { AGENTS } from "@/harness/agents";
import { BLUE, EYE, EYE_RECT, HAND, STICKER, bodyRects, type Pose, type Rect } from "./grid";
import { PROPS, type MascotKind, type Px } from "./props";
import { animKindFor, assembleProps, bodyFill, type Costume } from "@/harness/costume";

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
  /** A custom agent's outfit: parts per slot plus body colour. Overrides `kind`'s props. */
  costume?: Costume;
}

/**
 * The mascot as an SVG group in grid units (origin = tail's left edge, head's top). Embed inside any SVG.
 * `.m-hat` and `.m-held` are wrapped so that 0,0 is their pivot (head top / the hand); the hover
 * animations in mascot.css rotate and move them around that point.
 */
export function MascotArt({ kind = "base", pose = "stand", flip = false, sticker = true, costume }: ArtProps) {
  const body = bodyRects(pose);
  const p = costume ? assembleProps(costume) : PROPS[kind];
  const fill = (costume && bodyFill(costume)) || BLUE;
  const [hx, hy] = HAND[pose];
  const [px, py] = HEAD_PIVOT;
  const head = (p.head ?? []).map(([x, y, w, h, c]) => [x - px, y - py, w, h, c] as const);

  return (
    <g className="m-root" transform={flip ? "translate(17 0) scale(-1 1)" : undefined}>
      <g className="m-bob">
        {sticker && <Sticker rects={[...body, ...(p.back ?? []), ...(p.front ?? [])]} />}
        <g shapeRendering="crispEdges">
          <Fills rects={p.back ?? []} prefix="b" />
          {body.map((r, i) => rect(r, `m${i}`, fill))}
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
  /** Rendered width in px (or user units when nested in another SVG). */
  size?: number;
  title?: string;
  className?: string;
  /** "loop" plays the role animation continuously; "hover" waits for hover or focus. Default: loop from 40px up. */
  animate?: "loop" | "hover";
  /** Position when nested inside another SVG (e.g. a Backdrop). */
  x?: number;
  y?: number;
}

/** Below this size a loop would be visual noise (a sidebar of twelve bouncing icons), so it waits for hover. */
const LOOP_MIN_SIZE = 40;

/** The rendered height for a given width. */
export const mascotHeight = (width: number) => (width * VB_H) / VB_W;
/** Where the feet are, as a fraction of the rendered height (grid row 14 inside the viewBox). */
export const FEET_AT = (14 - VB_Y) / VB_H;

/** A standalone mascot. It loops its role animation, or (when small) plays it on hover of itself or a link/button around it. */
export function Mascot({ size = 96, title, className, animate, x, y, ...art }: MascotProps) {
  const kind = art.kind ?? "base";
  const custom = !!art.costume;
  // Agents hold their prop out in front of them unless a pose is asked for.
  const hasHeld = custom ? !!assembleProps(art.costume!).held : !!PROPS[kind].held;
  const pose = art.pose ?? (hasHeld ? "hold" : "stand");
  const label = title ?? (custom ? "Custom agent" : kind === "base" || kind === "studying" ? "Gabo mascot" : AGENTS[kind].name);
  return (
    <svg
      className={`mascot${className ? ` ${className}` : ""}`}
      data-kind={custom ? animKindFor(art.costume!) : kind}
      data-custom={custom || undefined}
      data-animate={animate ?? (size >= LOOP_MIN_SIZE ? "loop" : "hover")}
      x={x}
      y={y}
      width={size}
      height={mascotHeight(size)}
      viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <MascotArt {...art} pose={pose} />
    </svg>
  );
}
