import { describe, it, expect } from "vitest";
import {
  newPiece,
  newState,
  prepare,
  shape,
  smooth,
  openClay,
  volume,
  stretch,
  placeAt,
  advance,
  trim,
  addMark,
  dip,
  glazeMean,
  loadKiln,
  lightKiln,
  fireResult,
  validateSave,
} from "../src/simulation/model";
import { ceramicGeometry } from "../src/render/ceramic";
describe("same piece through the full craft dependency chain", () => {
  it("rejects early painting placement and wet kiln loading", () => {
    const s = newState(),
      p = newPiece("bowl", 1);
    expect(() => placeAt(p, "paint")).toThrow();
    expect(() => loadKiln(s, p)).toThrow();
    expect(() => openClay(p)).toThrow();
  });
  it("keeps identity, actual geometry and painted marks through firing", () => {
    const s = newState(),
      p = newPiece("bowl", 1);
    const id = p.id;
    s.pieces.push(p);
    prepare(p, 5, 0.65);
    openClay(p);
    const original = [...p.radius],
      v = volume(p);
    shape(p, 35, 0.025);
    expect(p.radius).not.toEqual(original);
    expect(volume(p)).toBeCloseTo(v, 7);
    placeAt(p, "rack");
    for (let i = 0; i < 100; i++) advance(s, 0.1);
    expect(p.stage).toBe("leather");
    placeAt(p, "wheel");
    trim(p, 4, 20);
    expect(p.stage).toBe("trimmed");
    placeAt(p, "paint");
    addMark(p, { u: 0.4, v: 0.5, size: 0.01, ink: 0.8, kind: "leaf" });
    placeAt(p, "glaze");
    dip(p, 3, 1);
    expect(glazeMean(p)).toBeCloseTo(0.66);
    expect(() => placeAt(p, "rack")).toThrow();
    p.footClean = true;
    placeAt(p, "rack");
    for (let i = 0; i < 110; i++) advance(s, 0.1);
    expect(p.stage).toBe("dry");
    loadKiln(s, p);
    lightKiln(s);
    for (let i = 0; i < 3000 && p.stage !== "fired"; i++) advance(s, 0.1);
    expect(p.stage).toBe("fired");
    expect(p.id).toBe(id);
    expect(p.marks).toHaveLength(1);
    expect(p.score).toBeGreaterThanOrEqual(80);
    expect(p.shrink).toBeLessThan(1);
    expect(s.kiln.curve.length).toBeGreaterThan(10);
  });
  it("supports bottle height without swapping the radial profile", () => {
    const p = newPiece("vase", 1);
    prepare(p, 5, 0.65);
    openClay(p);
    const r = [...p.radius];
    stretch(p, 0.38);
    shape(p, 45, -0.045);
    expect(p.height).toBe(0.38);
    expect(p.radius[10]).toBeCloseTo(r[10], 5);
    expect(p.radius[45]).toBeLessThan(r[45]);
  });
  it("explains underfire, overfire, thin-wall cracking and thick glaze separately", () => {
    const p = newPiece("bowl", 1);
    p.peak = 1100;
    fireResult(p, 0.5);
    expect(p.defects.some((d) => d.includes("欠火"))).toBe(true);
    p.peak = 1400;
    p.heat = 20;
    p.thickness[10] = 0.002;
    p.glaze.fill(1.6);
    fireResult(p, 0.5);
    expect(p.defects.some((d) => d.includes("过火"))).toBe(true);
    expect(p.defects.some((d) => d.includes("开裂"))).toBe(true);
    expect(p.defects.some((d) => d.includes("流釉"))).toBe(true);
  });
  it("does not advance dry-time off the drying rack", () => {
    const s = newState(),
      p = newPiece("bowl", 1);
    s.pieces.push(p);
    p.stage = "thrown";
    p.location = "held";
    for (let i = 0; i < 200; i++) advance(s, 0.1, 8);
    expect(p.stage).toBe("thrown");
    expect(p.dryTime).toBe(0);
  });
  it("round trips independent geometry, marks, props, player and kiln", () => {
    const s = newState();
    s.pieces.push(newPiece("vase", 1), newPiece("bowl", 2));
    s.activeId = s.pieces[0].id;
    s.props.brush = [2, 0.9, 1];
    const clone = validateSave(JSON.parse(JSON.stringify(s)));
    clone.pieces[0].radius[0] = 0.05;
    expect(s.pieces[0].radius[0]).not.toBe(0.05);
    expect(clone.props.brush).toEqual([2, 0.9, 1]);
    expect(clone.pieces[1].id).not.toBe(clone.pieces[0].id);
  });
  it("rejects corrupted and dangerous saved shapes before restoring anything", () => {
    const s = newState();
    s.pieces.push(newPiece("bowl", 1));
    s.pieces[0].radius[2] = Infinity;
    expect(() => validateSave(s)).toThrow();
    s.pieces[0].radius[2] = 0.1;
    s.pieces.push(s.pieces[0]);
    expect(() => validateSave(s)).toThrow();
  });
  it("keeps separate rack positions and prevents workbench overlaps and hot unloading", () => {
    const s = newState(),
      a = newPiece("bowl", 1),
      b = newPiece("vase", 2);
    s.pieces.push(a, b);
    prepare(a, 5, 0.65);
    prepare(b, 5, 0.65);
    placeAt(a, "wheel", s);
    expect(() => placeAt(b, "wheel", s)).toThrow("另一件");
    openClay(a);
    openClay(b);
    placeAt(a, "rack", s);
    placeAt(b, "rack", s);
    expect(a.position).not.toEqual(b.position);
    a.stage = "dry";
    s.kiln.phase = "firing";
    expect(() => placeAt(a, "kiln", s)).toThrow("窑还热");
  });
  it("rejects invalid identifiers, contradictory carrying and conflicting key bindings", () => {
    const s = newState(),
      p = newPiece("bowl", 1);
    s.pieces.push(p);
    p.id = '"><img src=x>';
    expect(() => validateSave(s)).toThrow();
    p.id = "valid-piece";
    p.location = "held";
    expect(() => validateSave(s)).toThrow("手持");
    s.held = p.id;
    s.activeId = p.id;
    s.settings.bindings.map = "KeyW";
    expect(() => validateSave(s)).toThrow("按键");
  });
  it("assisted firing stays within its target heat envelope", () => {
    const s = newState(),
      p = newPiece("bowl", 1);
    s.pieces.push(p);
    p.stage = "dry";
    p.air = 0.04;
    p.glaze.fill(0.68);
    loadKiln(s, p);
    lightKiln(s);
    for (let i = 0; i < 3000; i++) advance(s, 0.1);
    expect(p.stage).toBe("fired");
    expect(p.peak).toBeLessThanOrEqual(1290);
    expect(p.defects).toEqual([]);
    expect(p.score).toBe(98);
  });
  it("separates paintable inner and outer UV islands and smooths the circumference seam", () => {
    const p = newPiece("bowl", 1);
    prepare(p, 5, 0.65);
    openClay(p);
    const g = ceramicGeometry(p),
      uv = g.attributes.uv,
      n = g.attributes.normal,
      pos = g.attributes.position,
      stride = g.parameters.points.length;
    // Find each physical wall at mid-height. Tessellating the rolled lip or
    // throwing rings must not change the independence of inner/outer painting.
    const mid = Array.from({length:stride},(_,j)=>j)
      .filter(j=>Math.abs(pos.getY(j)-p.height*.5)<p.height*.08);
    const outer=mid.find(j=>n.getZ(j)>.3)!;
    const inner=mid.find(j=>n.getZ(j)<-.3)!;
    expect(outer).toBeDefined();expect(inner).toBeDefined();
    expect(uv.getX(64 * stride + outer)).toBeCloseTo(0.25);
    expect(uv.getX(64 * stride + inner)).toBeCloseTo(0.75);
    for (const j of [outer, inner, Math.floor(stride/2)]) {
      expect(n.getX(j)).toBeCloseTo(n.getX(128 * stride + j), 7);
      expect(n.getZ(j)).toBeCloseTo(n.getZ(128 * stride + j), 7);
    }
    g.dispose();
  });
  it("records only actual wheel contact, softens it on smoothing and preserves it in saves", () => {
    const s=newState(),p=newPiece('vase',1);s.pieces.push(p);prepare(p,5,.65);openClay(p);
    expect(p.wheelTraces).toBeUndefined();
    shape(p,24,.002,.6,0);expect(p.wheelTraces).toBeUndefined();
    shape(p,24.35,.002,.6,5);
    expect(p.wheelTraces).toHaveLength(1);
    expect(p.wheelTraces![0].v).toBeCloseTo(24.35/47);
    const depth=p.wheelTraces![0].depth;smooth(p);
    expect(p.wheelTraces![0].depth).toBeLessThan(depth);
    expect(validateSave(JSON.parse(JSON.stringify(s))).pieces[0].wheelTraces).toEqual(p.wheelTraces);
    p.wheelTraces![0].depth=10;expect(()=>validateSave(s)).toThrow('轮制');
  });
});
