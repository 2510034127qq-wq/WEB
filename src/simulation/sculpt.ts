import { clamp, volume, type Piece } from "./model";

// Radial gain is measured from the visible side-pull (1.3–2.1 s).
// Vertical gain and settling time are interaction tuning, not recovered source parameters.
export const SCULPT_RESPONSE = {
  radialGain: 0.16,
  heightGain: 0.55,
  seconds: 0.012,
};
const SPACING = 1.5;

/** Captured screen metrics and a spatially resampled tool path. The target
 * surface does not depend on render cadence. Vertical travel moves contact. */
export class SculptStroke {
  private targetRadius: number[];
  private thickness: number[];
  private originalHeight: number;
  private targetHeight: number;
  private materialVolume: number;
  private anchorRadius: number;
  private lastX = 0;
  private lastY = 0;
  private sampledX = 0;
  private sampledY = 0;
  private distanceSinceSample = 0;
  private changed = false;
  private traces: NonNullable<Piece["wheelTraces"]>;
  private tracesDirty = false;
  released = false;
  settled = false;
  mode: "pending" | "radius" | "height" | "smooth" = "pending";

  constructor(
    private piece: Piece,
    readonly v: number,
    private side: number,
    private metresPerPixel: number,
    private width = 0.28,
    smoothing = false,
  ) {
    this.targetRadius = [...piece.radius];
    this.thickness = [...piece.thickness];
    this.originalHeight = this.targetHeight = piece.height;
    this.materialVolume = volume(piece);
    this.anchorRadius = this.radiusAt(v);
    this.traces = structuredClone(piece.wheelTraces || []);
    if (smoothing) this.mode = "smooth";
  }

  get contactV() {
    return this.mode === "height"
      ? 1
      : clamp(
          this.v - (this.lastY * this.metresPerPixel) / this.originalHeight,
          0.015,
          1,
        );
  }

  private radiusAt(v: number) {
    const i = clamp(v, 0, 1) * 47,
      row = Math.min(46, Math.floor(i)),
      f = i - row;
    return this.targetRadius[row] * (1 - f) + this.targetRadius[row + 1] * f;
  }

  move(x: number, y: number) {
    if (this.released || !Number.isFinite(x + y)) return;
    if (this.mode === "pending") {
      if (Math.hypot(x, y) < 1.5) return;
      this.mode =
        this.v > 0.86 && Math.abs(y) > Math.abs(x) * 0.85 ? "height" : "radius";
    }
    if (this.mode === "height") {
      this.targetHeight = clamp(
        this.originalHeight -
          y * this.metresPerPixel * SCULPT_RESPONSE.heightGain,
        0.09,
        0.44,
      );
      this.changed = true;
      this.lastX = x;
      this.lastY = y;
      return;
    }
    const dx = x - this.lastX,
      dy = y - this.lastY,
      distance = Math.hypot(dx, dy);
    if (!distance) return;
    let walked = SPACING - this.distanceSinceSample;
    while (walked <= distance) {
      const f = walked / distance;
      this.sample(this.lastX + dx * f, this.lastY + dy * f, SPACING);
      walked += SPACING;
    }
    this.distanceSinceSample = distance - (walked - SPACING);
    this.lastX = x;
    this.lastY = y;
  }

  private sample(x: number, y: number, distance: number) {
    const v = clamp(
      this.v - (y * this.metresPerPixel) / this.originalHeight,
      0.015,
      1,
    );
    const influence = this.targetRadius.map((_, i) => {
      const d = (i / 47 - v) / this.width;
      // Soft contact pad; the wheel supports the bottom few millimetres.
      const support = clamp(i / 47 / 0.035, 0, 1);
      return Math.exp(-2.1 * d * d) * support * support * (3 - 2 * support);
    });
    if (this.mode === "smooth") {
      const old = [...this.targetRadius];
      const strength = 1 - Math.exp(-distance / 18);
      for (let i = 1; i < 47; i++) {
        let sum = 0,
          weights = 0;
        for (let j = -3; j <= 3; j++) {
          const w = 4 - Math.abs(j);
          sum += old[clamp(i + j, 0, 47)] * w;
          weights += w;
        }
        this.targetRadius[i] +=
          (sum / weights - old[i]) * influence[i] * strength;
      }
      for (const trace of this.traces) {
        const weight = Math.exp(-2.1 * ((trace.v - v) / this.width) ** 2);
        trace.depth *= Math.exp((-distance / 36) * weight);
      }
      this.tracesDirty = this.traces.length > 0;
    } else {
      const desired = clamp(
        this.anchorRadius +
          x * this.metresPerPixel * this.side * SCULPT_RESPONSE.radialGain,
        0.032,
        0.235,
      );
      const error = desired - this.radiusAt(v);
      // Scale the complete field at bounds. Clamping individual rings creates
      // flat shelves when one row reaches a limit before its neighbours.
      let limit = 1;
      for (let i = 0; i < 48; i++) {
        const delta = error * influence[i];
        if (Math.abs(delta) > 1e-12)
          limit = Math.min(
            limit,
            ((delta > 0 ? 0.235 : 0.032) - this.targetRadius[i]) / delta,
          );
      }
      for (let i = 0; i < 48; i++)
        this.targetRadius[i] += error * influence[i] * Math.max(0, limit);
      // The rotating wet wall records actual contact travel, never random ribs.
      // Broad soft fingers leave sub-millimetre relief; polishing removes it locally.
      if (Math.abs(error * limit) > 1e-7 && v > 0.04 && v < 0.96) {
        let trace = this.traces.find(
          (t) => Math.abs(t.v - v) * this.originalHeight < 0.003,
        );
        if (!trace) {
          if (this.traces.length >= 96) this.traces.shift();
          trace = { v, width: 0.008, depth: 0 };
          this.traces.push(trace);
        }
        trace.depth += (0.0001 - trace.depth) * (1 - Math.exp(-distance / 80));
        this.tracesDirty = true;
      }
    }
    this.sampledX = x;
    this.sampledY = y;
    this.changed = true;
  }

  /** Keep the same settling curve on release instead of a one-frame snap. */
  release() {
    if (this.released) return;
    if (this.mode === "radius" || this.mode === "smooth") {
      const remaining = Math.hypot(
        this.lastX - this.sampledX,
        this.lastY - this.sampledY,
      );
      if (remaining > 1e-6) this.sample(this.lastX, this.lastY, remaining);
    }
    this.released = true;
    if (!this.changed) this.settled = true;
  }

  step(dt: number, finish = false) {
    if (finish) this.release(); // Exact flush is used by offline simulation only.
    if (!this.changed || this.settled) return false;
    const a = finish
      ? 1
      : 1 - Math.exp(-Math.max(0, dt) / SCULPT_RESPONSE.seconds);
    const p = this.piece;
    let residual = Math.abs(this.targetHeight - p.height),
      delta = 0;
    const nextHeight = p.height + (this.targetHeight - p.height) * a;
    delta += Math.abs(nextHeight - p.height);
    p.height = nextHeight;
    for (let i = 0; i < 48; i++) {
      residual = Math.max(
        residual,
        Math.abs(this.targetRadius[i] - p.radius[i]),
      );
      const dr = (this.targetRadius[i] - p.radius[i]) * a;
      p.radius[i] += dr;
      delta += Math.abs(dr);
    }
    if (this.released && residual < 1e-7) this.settled = true;
    const tracesChanged = this.tracesDirty;
    if (tracesChanged) {
      p.wheelTraces = this.traces
        .filter((t) => t.depth > 1e-8)
        .map((t) => ({ ...t }));
      this.tracesDirty = false;
    }
    if (delta < 1e-10) return tracesChanged;
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
