import { clamp, volume, type Piece } from "./model";

/** A stroke owns a stable screen-to-clay metric. Leaving the silhouette does
 * not lose the grab, and event frequency cannot change the resulting profile. */
export class SculptStroke {
  private radius: number[];
  private thickness: number[];
  private height: number;
  private materialVolume: number;
  private x = 0;
  private y = 0;
  private appliedX = 0;
  private appliedY = 0;
  mode: "pending" | "radius" | "height" = "pending";
  constructor(
    private piece: Piece,
    readonly v: number,
    private side: number,
    private metresPerPixel: number,
    private width = 0.19,
  ) {
    this.radius = [...piece.radius];
    this.thickness = [...piece.thickness];
    this.height = piece.height;
    this.materialVolume = volume(piece);
  }
  move(x: number, y: number) {
    this.x = x;
    this.y = y;
    if (this.mode === "pending" && Math.hypot(x, y) > 3)
      this.mode =
        this.v > 0.82 && Math.abs(y) > Math.abs(x) * 0.85 ? "height" : "radius";
  }
  step(dt: number, finish = false) {
    if (this.mode === "pending") return false;
    const a = finish ? 1 : 1 - Math.exp(-dt / 0.028);
    const x = this.appliedX + (this.x - this.appliedX) * a,
      y = this.appliedY + (this.y - this.appliedY) * a;
    if (Math.abs(x - this.appliedX) + Math.abs(y - this.appliedY) < 0.001)
      return false;
    this.appliedX = x;
    this.appliedY = y;
    const p = this.piece;
    p.height =
      this.mode === "height"
        ? clamp(this.height - y * this.metresPerPixel, 0.09, 0.44)
        : this.height;
    const delta = x * this.metresPerPixel * this.side;
    for (let i = 0; i < 48; i++) {
      const d = (i / 47 - this.v) / this.width;
      // Broad C2 bell: a continuous shoulder instead of a row of pinched rings.
      const influence = Math.exp(-d * d * 2.1);
      p.radius[i] = clamp(
        this.radius[i] + (this.mode === "radius" ? delta * influence : 0),
        0.032,
        0.235,
      );
    }
    let lo = 0.03,
      hi = 12;
    for (let j = 0; j < 24; j++) {
      const factor = (lo + hi) * 0.5;
      for (let i = 0; i < 48; i++)
        p.thickness[i] = clamp(
          this.thickness[i] * factor,
          0.002,
          Math.min(0.04, p.radius[i] * 0.8),
        );
      if (volume(p) > this.materialVolume) hi = factor;
      else lo = factor;
    }
    p.stage = "thrown";
    return true;
  }
}
