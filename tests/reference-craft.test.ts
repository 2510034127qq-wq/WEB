import { describe, it, expect } from "vitest";
import { SculptStroke } from "../src/simulation/sculpt";
import {
  newPiece,
  newState,
  prepare,
  openClay,
  volume,
  validateSave,
  loadKiln,
  lightKiln,
  advance,
} from "../src/simulation/model";
import { ceramicGeometry, updateCeramicGeometry } from "../src/render/ceramic";
const clay = () => {
  const p = newPiece("vase", 1);
  prepare(p, 5, 0.65);
  openClay(p);
  return p;
};
describe("reference craft interactions", () => {
  it("holds the same shape independent of pointer-event count, while preserving clay volume", () => {
    const a = clay(),
      b = structuredClone(a),
      v = volume(a);
    const one = new SculptStroke(a, 0.55, 1, 0.0007),
      many = new SculptStroke(b, 0.55, 1, 0.0007);
    one.move(80, 0);
    one.step(1, true);
    for (let i = 1; i <= 80; i++) {
      many.move(i, 0);
      many.step(1 / 120);
    }
    many.step(0, true);
    a.radius.forEach((r, i) => expect(r).toBeCloseTo(b.radius[i], 10));
    expect(volume(a)).toBeCloseTo(v, 6);
    expect(a.radius[26]).toBeGreaterThan(a.radius[5]);
  });
  it("matches the observed side-pull gain within 50 ms and supports left-side grabs", () => {
    const a = clay(),
      b = structuredClone(a),
      r = a.radius[24];
    const right = new SculptStroke(a, 24 / 47, 1, 0.001),
      left = new SculptStroke(b, 24 / 47, -1, 0.001);
    right.move(40, 0);
    left.move(-40, 0);
    for (let i = 0; i < 3; i++) {
      right.step(1 / 60);
      left.step(1 / 60);
    }
    expect(a.radius[24] - r).toBeGreaterThan(0.006);
    expect(a.radius[24] - r).toBeLessThan(0.0065);
    expect(a.radius).toEqual(b.radius);
  });
  it("pulls the rim vertically without pinching the profile and keeps geometry buffers", () => {
    const p = clay(),
      r = [...p.radius],
      g = ceramicGeometry(p),
      position = g.attributes.position.array,
      index = g.index;
    const stroke = new SculptStroke(p, 0.96, 1, 0.001);
    stroke.move(0, -90);
    stroke.step(0, true);
    expect(p.radius).toEqual(r);
    expect(p.height).toBeGreaterThan(0.2);
    expect(updateCeramicGeometry(g, p)).toBe(true);
    expect(g.attributes.position.array).toBe(position);
    expect(g.index).toBe(index);
    expect([...g.attributes.normal.array].every(Number.isFinite)).toBe(true);
    g.dispose();
  });
  it("round trips editable decoration and rejects unbounded canvas data", () => {
    const s = newState(),
      p = clay();
    s.pieces.push(p);
    p.decoration = {
      baseColor: "#173f78",
      layers: [
        {
          id: "text-1",
          kind: "text",
          text: "福",
          color: "#c4a552",
          u: 0.5,
          v: 0.5,
          width: 0.2,
          height: 0.2,
          rotation: 0,
          opacity: 1,
        },
      ],
    };
    expect(validateSave(structuredClone(s)).pieces[0].decoration).toEqual(
      p.decoration,
    );
    p.decoration.layers[0].width = Infinity;
    expect(() => validateSave(s)).toThrow("彩绘");
  });
  it("lets player heat, hold the target band and cool the same decorated piece", () => {
    const s = newState(),
      p = clay();
    s.pieces.push(p);
    p.stage = "dry";
    p.air = 0.04;
    p.glaze.fill(0.68);
    loadKiln(s, p);
    lightKiln(s);
    Object.assign(s.kiln, { assisted: false, controlled: true, power: 1 });
    while (s.kiln.temperature < 1260) advance(s, 0.02);
    s.kiln.power = 0;
    const target = s.kiln.temperature;
    for (let i = 0; i < 800; i++) advance(s, 0.02);
    expect(s.kiln.temperature).toBeCloseTo(target, 7);
    expect(p.heat).toBeGreaterThan(11);
    s.kiln.phase = "cooling";
    for (let i = 0; i < 3000 && s.pieces[0].stage === "loaded"; i++)
      advance(s, 0.03);
    expect(p.stage).toBe("fired");
    expect(p.defects).toEqual([]);
  });
});
