export type PaintLayer = {
  id: string;
  kind: "stroke" | "band" | "flower" | "wave" | "text";
  u: number;
  v: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  opacity: number;
  text?: string;
  points?: [number, number][];
};
export type Decoration = { baseColor: string; layers: PaintLayer[] };
export function validDecoration(d: Decoration) {
  const color = (c: unknown) =>
    typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
  return (
    !!d &&
    color(d.baseColor) &&
    Array.isArray(d.layers) &&
    d.layers.length <= 160 &&
    d.layers.every(
      (l) =>
        l &&
        typeof l.id === "string" &&
        l.id.length <= 80 &&
        ["stroke", "band", "flower", "wave", "text"].includes(l.kind) &&
        color(l.color) &&
        [l.u, l.v, l.width, l.height, l.rotation, l.opacity].every(
          Number.isFinite,
        ) &&
        l.u >= 0 &&
        l.u <= 1 &&
        l.v >= 0 &&
        l.v <= 1 &&
        l.width >= 0.001 &&
        l.width <= 2 &&
        l.height >= 0.001 &&
        l.height <= 2 &&
        Math.abs(l.rotation) <= Math.PI * 20 &&
        l.opacity >= 0 &&
        l.opacity <= 1 &&
        (l.text === undefined ||
          (typeof l.text === "string" && l.text.length <= 24)) &&
        (l.points === undefined ||
          (Array.isArray(l.points) &&
            l.points.length <= 4000 &&
            l.points.every(
              (p) =>
                Array.isArray(p) &&
                p.length === 2 &&
                p.every((n) => Number.isFinite(n) && Math.abs(n) <= 2),
            ))),
    )
  );
}
