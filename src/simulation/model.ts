import {validDecoration,type Decoration} from './decoration.ts';
export type Stage =
  | "raw"
  | "prepared"
  | "thrown"
  | "leather"
  | "trimmed"
  | "painted"
  | "glazed"
  | "dry"
  | "loaded"
  | "fired"
  | "packed";
export type StationId =
  | "supply"
  | "clay"
  | "wheel"
  | "rack"
  | "paint"
  | "glaze"
  | "kiln"
  | "display";
export type Vec3 = [number, number, number];
export type Mark = {
  u: number;
  v: number;
  size: number;
  ink: number;
  kind: "brush" | "leaf" | "flower" | "wave" | "band";
  surface?: "outer" | "inner";
  end?: boolean;
};
export type WheelTrace = { v:number; width:number; depth:number };
export interface Piece {
  id: string;
  name: string;
  form: "bowl" | "vase";
  stage: Stage;
  location: StationId | "held" | "ground";
  position: Vec3;
  radius: number[];
  height: number;
  thickness: number[];
  /** Actual fingertip/tool contacts. Missing in older saves, never synthesized. */
  wheelTraces?: WheelTrace[];
  moisture: number;
  purity: number;
  air: number;
  preparation: number;
  opened: boolean;
  trimmed: number;
  marks: Mark[];
  decoration?: Decoration;
  handles?: 0|1|2;
  glaze: number[];
  footClean: boolean;
  dryTime: number;
  heat: number;
  peak: number;
  stress: number;
  shrink: number;
  kilnPosition: "front" | "middle" | "back";
  defects: string[];
  score: number;
  history: string[];
  created: number;
}
export interface Settings {
  sound: boolean;
  volume: number;
  quality: "high" | "low";
  sensitivity: number;
  bob: boolean;
  assist: boolean;
  subtitles: boolean;
  bindings: Record<string, string>;
}
export interface GameState {
  version: 1;
  pieces: Piece[];
  activeId: string | null;
  held: string | null;
  player: Vec3;
  yaw: number;
  day: number;
  props: Record<string, Vec3>;
  kiln: {
    phase: "idle" | "firing" | "cooling";
    temperature: number;
    fuel: number;
    draft: number;
    elapsed: number;
    curve: [number, number][];
    assisted: boolean;
    controlled?: boolean;
    power?: number;
  };
  settings: Settings;
}
export const STAGES: Record<Stage, string> = {
  raw: "原泥",
  prepared: "熟泥",
  thrown: "湿坯",
  leather: "半干坯",
  trimmed: "利坯",
  painted: "画坯",
  glazed: "釉坯",
  dry: "待入窑",
  loaded: "装匣",
  fired: "出窑",
  packed: "入藏",
};
export const STATIONS: {
  id: StationId;
  name: string;
  subtitle: string;
  pos: Vec3;
  approach: Vec3;
  number: string;
}[] = [
  {
    id: "supply",
    name: "原料房",
    subtitle: "取一抔瓷土",
    pos: [-6, 0.92, 5],
    approach: [-4.8, 1.65, 3.7],
    number: "壹",
  },
  {
    id: "clay",
    name: "淘练台",
    subtitle: "水土相和",
    pos: [-5.6, 0.94, -5.6],
    approach: [-5.6, 1.65, -3.8],
    number: "贰",
  },
  {
    id: "wheel",
    name: "辘轳",
    subtitle: "掌中有天地",
    pos: [0, 0.78, -5.6],
    approach: [0, 1.65, -3.9],
    number: "叁",
  },
  {
    id: "rack",
    name: "阴干架",
    subtitle: "等泥土呼吸",
    pos: [-7.4, 1, -0.2],
    approach: [-5.7, 1.65, -0.2],
    number: "肆",
  },
  {
    id: "paint",
    name: "青花案",
    subtitle: "落笔成青",
    pos: [5.4, 0.96, -5.6],
    approach: [5.4, 1.65, -3.8],
    number: "伍",
  },
  {
    id: "glaze",
    name: "釉药间",
    subtitle: "薄釉藏光",
    pos: [7.2, 0.95, -0.2],
    approach: [5.6, 1.65, -0.2],
    number: "陆",
  },
  {
    id: "kiln",
    name: "镇窑",
    subtitle: "以火成器",
    pos: [6, 0.88, 5.5],
    approach: [6, 1.65, 2.75],
    number: "柒",
  },
  {
    id: "display",
    name: "成器堂",
    subtitle: "一器一生",
    pos: [0, 0.96, 5.8],
    approach: [0, 1.65, 3.7],
    number: "捌",
  },
];
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export function newState(): GameState {
  return {
    version: 1,
    pieces: [],
    activeId: null,
    held: null,
    player: [0, 1.65, 2.7],
    yaw: 0,
    day: 1,
    props: {
      brush: [5.85, 1.02, -5.3],
      knife: [0.65, 0.9, -5.45],
      sagger: [4.6, 0.3, 5.7],
      bamboo: [-0.85, 0.8, -5.5],
    },
    kiln: {
      phase: "idle",
      temperature: 24,
      fuel: 0,
      draft: 0.5,
      elapsed: 0,
      curve: [],
      assisted: true,
    },
    settings: {
      sound: true,
      volume: 0.4,
      quality: "high",
      sensitivity: 1,
      bob: true,
      assist: true,
      subtitles: true,
      bindings: {
        forward: "KeyW",
        back: "KeyS",
        left: "KeyA",
        right: "KeyD",
        interact: "KeyE",
        drop: "KeyQ",
        journal: "KeyJ",
        map: "KeyM",
      },
    },
  };
}
export function newPiece(form: "bowl" | "vase", index: number): Piece {
  return {
    id: crypto.randomUUID(),
    name: `${form === "bowl" ? "青花碗" : "青花瓶"} · ${String(index).padStart(2, "0")}`,
    form,
    stage: "raw",
    location: "supply",
    position: [-6, 0.98, 5],
    radius: Array.from(
      { length: 48 },
      (_, i) => 0.095 + Math.sin((i / 47) * Math.PI) * 0.015,
    ),
    height: 0.16,
    thickness: Array(48).fill(0.016),
    moisture: 0.7,
    purity: 0.75,
    air: 0.65,
    preparation: 0,
    opened: false,
    trimmed: 0,
    marks: [],
    glaze: Array(192).fill(0),
    footClean: false,
    dryTime: 0,
    heat: 0,
    peak: 0,
    stress: 0,
    shrink: 1,
    kilnPosition: "middle",
    defects: [],
    score: 0,
    history: ["领取瓷石与高岭土配成的原泥；来源工序在原料房札记中说明。"],
    created: Date.now(),
  };
}
export function volume(p: Piece) {
  let v = 0;
  const dy = p.height / (p.radius.length - 1);
  for (let i = 0; i < p.radius.length; i++) {
    const r = p.radius[i],
      t = p.thickness[i];
    v += Math.PI * (r * r - Math.max(0, r - t) ** 2) * dy;
  }
  return v;
}
export function shape(p: Piece, ring: number, delta: number, pressure = 0.5, angularSpeed = 6) {
  if (!["prepared", "thrown"].includes(p.stage) || !p.opened) return false;
  const before = volume(p);
  const radius = [...p.radius];
  for (let i = 0; i < 48; i++) {
    const influence = Math.exp(-(((i - ring) / 5) ** 2));
    p.radius[i] = clamp(
      radius[i] + delta * influence * (0.4 + pressure),
      0.032,
      0.235,
    );
  }
  // Preserve wall-material volume by solving a single thickness scale; no preset replacement.
  let lo = 0.05,
    hi = 8;
  const original = [...p.thickness];
  for (let j = 0; j < 32; j++) {
    const s = (lo + hi) / 2;
    p.thickness = original.map((t, i) =>
      clamp(t * s, 0.002, Math.min(0.04, p.radius[i] * 0.8)),
    );
    if (volume(p) > before) hi = s;
    else lo = s;
  }
  p.stage = "thrown";
  if(Math.abs(delta)>1e-6&&angularSpeed>.2) {
    const v=clamp(ring/47,0,1),width=.006+clamp(pressure,0,1)*.008,
      depth=Math.min(.00022,Math.abs(delta)*.12)*clamp(angularSpeed/6,.2,1);
    const traces=p.wheelTraces??=[];
    const nearby=traces.find(t=>Math.abs(t.v-v)*p.height<.002);
    if(nearby){nearby.depth=Math.min(.00035,nearby.depth+depth*.3);nearby.width=width;}
    else {if(traces.length>=128)traces.shift();traces.push({v,width,depth});}
  }
  if (Math.min(...p.thickness) < 0.0035) p.stress += Math.abs(delta) * 2;
  return true;
}
export function stretch(p: Piece, height: number) {
  if (!p.opened || !["prepared", "thrown"].includes(p.stage)) return;
  const next = clamp(height, 0.09, 0.44),
    ratio = p.height / next;
  p.height = next;
  p.thickness = p.thickness.map((t) => clamp(t * ratio, 0.002, 0.04));
  p.stage = "thrown";
}
export function smooth(p: Piece) {
  if (!p.opened || !["prepared", "thrown"].includes(p.stage)) return;
  if(p.wheelTraces)p.wheelTraces=p.wheelTraces.map(t=>({...t,depth:t.depth*.65})).filter(t=>t.depth>.00001);
  const before = volume(p),
    old = [...p.radius],
    thickness = [...p.thickness];
  p.radius = old.map((r, i) => {
    let sum = 0,
      weights = 0;
    for (let j = -4; j <= 4; j++) {
      const weight = 5 - Math.abs(j);
      sum += old[clamp(i + j, 0, 47)] * weight;
      weights += weight;
    }
    return r * 0.35 + (sum / weights) * 0.65;
  });
  let lo = 0.05,
    hi = 8;
  for (let i = 0; i < 32; i++) {
    const factor = (lo + hi) / 2;
    p.thickness = thickness.map((t, j) =>
      clamp(t * factor, 0.002, Math.min(0.04, p.radius[j] * 0.8)),
    );
    if (volume(p) > before) hi = factor;
    else lo = factor;
  }
}
export function prepare(p: Piece, dt: number, water: number) {
  if (p.stage !== "raw") return;
  p.preparation = clamp(p.preparation + dt * 0.22, 0, 1);
  p.air = clamp(p.air - dt * 0.12, 0.04, 1);
  p.purity = clamp(p.purity + dt * 0.045, 0, 0.99);
  p.moisture += (water - p.moisture) * Math.min(1, dt);
  if (p.preparation >= 1) {
    p.stage = "prepared";
    p.history.push(
      `淘洗练泥：纯度 ${Math.round(p.purity * 100)}%，含水 ${Math.round(p.moisture * 100)}%。`,
    );
  }
}
export function openClay(p: Piece) {
  if (p.stage !== "prepared") throw new Error("先把原泥淘洗、练匀。");
  if (p.moisture < 0.42 || p.moisture > 0.82)
    throw new Error("泥料太干或太湿，请在淘练台调水。");
  p.opened = true;
  p.stage = "thrown";
  p.history.push("竹杖起轮，定中心后开孔。");
}
export function trim(p: Piece, dt: number, ring: number) {
  if (p.stage !== "leather" && p.stage !== "trimmed") return;
  p.thickness = p.thickness.map((t, i) =>
    Math.max(0.003, t - dt * 0.0008 * Math.exp(-(((i - ring) / 7) ** 2))),
  );
  p.trimmed = clamp(p.trimmed + dt * 0.26, 0, 1);
  if(p.wheelTraces)for(const t of p.wheelTraces)t.depth*=1-Math.min(.8,dt*2)*Math.exp(-(((t.v*47-ring)/4)**2));
  if (p.trimmed === 1 && p.stage !== "trimmed") {
    p.stage = "trimmed";
    p.history.push("半干利坯，旋削圈足。");
  }
}
export function addMark(p: Piece, m: Mark) {
  if (!["trimmed", "painted"].includes(p.stage)) return;
  if (p.marks.length >= 6000) return;
  p.marks.push(m);
  p.stage = "painted";
}
export function glazeAt(p: Piece, u: number, v: number, amount: number) {
  if (!["trimmed", "painted", "glazed"].includes(p.stage)) return;
  const col = Math.floor(clamp(u, 0, 0.999) * 16),
    row = Math.floor(clamp(v, 0, 0.999) * 12);
  p.glaze[row * 16 + col] = clamp(p.glaze[row * 16 + col] + amount, 0, 2);
  if(v<.12 && amount>0)p.footClean=false;
  p.stage = "glazed";
}
export const glazeMean = (p: Piece) => p.glaze.reduce((a, b) => a + b, 0) / 192;
export function dip(p: Piece, dt: number, depth: number) {
  if (!["trimmed", "painted", "glazed"].includes(p.stage)) return;
  if (depth <= 0 || dt <= 0) return;
  p.footClean = false;
  for (let r = 0; r < 12; r++)
    if (r / 12 <= depth)
      for (let c = 0; c < 16; c++)
        p.glaze[r * 16 + c] = clamp(p.glaze[r * 16 + c] + dt * 0.22, 0, 2);
  p.stage = "glazed";
}
export function placeAt(p: Piece, station: StationId, state?: GameState) {
  const valid: Record<StationId, Stage[]> = {
    supply: ["raw"],
    clay: ["raw", "prepared"],
    wheel: ["prepared", "thrown", "leather", "trimmed"],
    rack: ["thrown", "leather", "trimmed", "painted", "glazed", "dry"],
    paint: ["trimmed", "painted"],
    glaze: ["trimmed", "painted", "glazed"],
    kiln: ["dry", "loaded"],
    display: ["fired", "packed"],
  };
  if (!valid[station].includes(p.stage))
    throw new Error(
      `这里暂时不能加工「${STAGES[p.stage]}」。${nextTask(p).text}`,
    );
  if (station === "rack" && p.stage === "thrown" && !p.opened)
    throw new Error("先在辘轳上开孔、拉坯。");
  if (
    station === "rack" &&
    p.stage === "glazed" &&
    (!p.footClean || glazeMean(p) < 0.2)
  )
    throw new Error("先施上釉，并擦净底足接触面。");
  const others =
    state?.pieces.filter(
      (q) => q.id !== p.id && q.location === station && q.stage !== "packed",
    ) || [];
  if (!["rack", "kiln", "display"].includes(station) && others.length)
    throw new Error("案上已有另一件坯，请先把它移到阴干架或空地。");
  if (station === "kiln" && state && state.kiln.phase !== "idle")
    throw new Error("窑还热着，等它自然冷却再靠近装卸。");
  const s = STATIONS.find((s) => s.id === station)!;
  let position: Vec3 = [...s.pos];
  if (station === "rack") {
    const slots: Vec3[] = [
      ...[-0.4, 0.3, -1.1, 1, -1.8].map((z) => [-7.15, 1.005, z] as Vec3),
      ...[-0.4, 0.3, -1.1, 1, -1.8].map((z) => [-7.15, 0.445, z] as Vec3),
    ];
    const free = slots.find(
      (v) =>
        !others.some(
          (q) =>
            Math.hypot(
              q.position[0] - v[0],
              q.position[1] - v[1],
              q.position[2] - v[2],
            ) < 0.3,
        ),
    );
    if (!free) throw new Error("阴干架已满，先取下一件半干坯。");
    position = free;
  }
  if (station === "kiln") {
    const slots: Vec3[] = [
      [5.9, 0.45, 4.65],
      [6.55, 0.45, 4.65],
      [5.25, 0.45, 4.65],
    ];
    const free = slots.find(
      (v) =>
        !others.some(
          (q) => Math.hypot(q.position[0] - v[0], q.position[2] - v[2]) < 0.4,
        ),
    );
    if (!free) throw new Error("这一窑的三个装匣位已满。");
    position = free;
  }
  if (station === "display" && others.length)
    throw new Error("验器案已有出窑作品，先将它包装入藏。");
  p.location = station;
  p.position = position;
}
export function advance(s: GameState, dt: number, timeScale = 1) {
  const step = Math.min(dt, 0.1) * timeScale;
  for (const p of s.pieces) {
    if (p.location === "rack" && ["thrown", "glazed"].includes(p.stage)) {
      p.dryTime += step;
      p.moisture = Math.max(0.02, p.moisture - step * 0.055);
      if (p.stage === "thrown" && p.dryTime >= 8) {
        p.stage = "leather";
        p.moisture = 0.3;
        p.dryTime = 0;
        p.history.push("置架阴干，达到利坯的半干状态。");
        s.day++;
      }
      if (p.stage === "glazed" && p.dryTime >= 10) {
        p.stage = "dry";
        p.moisture = 0.02;
        p.dryTime = 0;
        p.history.push("清足后充分阴干，备妥匣钵。");
        s.day++;
      }
    }
  }
  const k = s.kiln;
  if (k.phase === "firing") {
    k.elapsed += step;
    if (k.assisted) {
      k.fuel = Math.max(k.fuel, 0.65);
      k.draft = k.temperature < 900 ? 0.64 : 0.52;
    }
    k.fuel = Math.max(0, k.fuel - step * 0.018);
    const gain = k.controlled ? clamp(k.power||0,-1,1)*95 :
      k.fuel * (0.25 + k.draft) * 58 - 6 - (k.temperature / 1300) * 7;
    if(k.controlled){k.fuel=.65;k.draft=.55;}
    k.temperature = clamp(k.temperature + gain * step, 24, 1440);
    if (k.assisted) k.temperature = Math.min(k.temperature, 1290);
    for (const p of s.pieces.filter((p) => p.stage === "loaded")) {
      const actual =
        k.temperature *
        (p.kilnPosition === "front"
          ? 1.035
          : p.kilnPosition === "back"
            ? 0.965
            : 1);
      p.peak = Math.max(p.peak, actual);
      if (actual > 1180) p.heat += (step * (actual - 1180)) / 100;
      if (gain > 35 && actual < 600) p.stress += step * 0.004;
    }
    if (
      k.assisted &&
      k.temperature >= 1290 &&
      s.pieces.filter((p) => p.stage === "loaded").every((p) => p.heat > 11)
    )
      k.phase = "cooling";
  }
  if (k.phase === "cooling") {
    k.elapsed += step;
    k.temperature = Math.max(
      24,
      k.temperature - step * Math.max(9, (k.temperature - 24) * 0.075),
    );
    if (k.temperature <= 65) {
      k.phase = "idle";
      k.fuel = 0;
      s.day += 2;
      for (const p of s.pieces.filter((p) => p.stage === "loaded"))
        fireResult(p, k.draft);
    }
  }
  if (
    k.phase !== "idle" &&
    (k.curve.length === 0 || k.elapsed - k.curve[k.curve.length - 1][0] >= 1)
  )
    k.curve.push([+k.elapsed.toFixed(2), +k.temperature.toFixed(1)]);
}
export function loadKiln(s: GameState, p: Piece) {
  if (p.stage !== "dry") throw new Error("坯体必须先清足并充分阴干。");
  if (s.kiln.phase !== "idle") throw new Error("本窑尚未冷却，稍候再装。");
  p.stage = "loaded";
  p.location = "kiln";
  p.history.push(
    `装入匣钵，选${{ front: "前", middle: "中", back: "后" }[p.kilnPosition]}窑位。`,
  );
}
export function lightKiln(s: GameState) {
  if (s.kiln.phase !== "idle" || !s.pieces.some((p) => p.stage === "loaded"))
    throw new Error("先把干坯装入匣钵。");
  s.kiln = {
    phase: "firing",
    temperature: 24,
    fuel: 0.65,
    draft: 0.6,
    elapsed: 0,
    curve: [],
    assisted: s.settings.assist,
  };
}
export function fireResult(p: Piece, draft: number) {
  p.defects = [];
  const g = glazeMean(p),
    coverage = p.glaze.filter((v) => v > 0.25).length / 192;
  if (p.peak < 1200 || p.heat < 5) p.defects.push("欠火：烧结不足，釉面失透");
  if (p.peak > 1350) p.defects.push("过火：口沿发生轻微变形");
  if (p.stress > 0.36 || Math.min(...p.thickness) < 0.0032)
    p.defects.push("开裂：薄壁或升温应力过大");
  if (p.air > 0.2) p.defects.push("针孔：泥中残留气隙");
  if (g > 1.2) p.defects.push("流釉：釉层过厚");
  if (coverage < 0.85) p.defects.push("缩釉 / 漏釉：覆盖不均");
  if (draft > 0.85 || draft < 0.2) p.defects.push("发色偏差：窑内气氛不稳");
  p.score = Math.max(
    18,
    98 - p.defects.length * 17 - Math.round(Math.abs(g - 0.68) * 8),
  );
  p.shrink = clamp(0.91 - (p.peak - 1220) * 0.0001, 0.87, 0.94);
  p.stage = "fired";
  p.history.push(
    `自然冷却开窑，最高模拟温度 ${Math.round(p.peak)} ℃，收缩 ${Math.round((1 - p.shrink) * 100)}%。`,
  );
}
export function nextTask(p?: Piece | null): {
  station: StationId;
  text: string;
} {
  if (!p) return { station: "supply", text: "去原料房，领取第一团瓷泥" };
  switch (p.stage) {
    case "raw":
      return { station: "clay", text: "带泥料去淘练台，淘洗、调水与练泥" };
    case "prepared":
      return { station: "wheel", text: "带熟泥到辘轳，开孔并塑造器形" };
    case "thrown":
      return { station: "rack", text: "把湿坯放在阴干架，等到半干" };
    case "leather":
      return { station: "wheel", text: "回到辘轳，旋削坯壁与圈足" };
    case "trimmed":
      return { station: "paint", text: "到青花案，用笔在坯上留下纹样" };
    case "painted":
      return { station: "glaze", text: "到釉药间施釉，然后擦净底足" };
    case "glazed":
      return {
        station: p.footClean ? "rack" : "glaze",
        text: p.footClean
          ? "放回阴干架，充分干燥后入窑"
          : "施釉后，擦净底足接触面",
      };
    case "dry":
      return { station: "kiln", text: "到窑棚装匣，选择窑位" };
    case "loaded":
      return { station: "kiln", text: "封窑起火，观察火候，再自然冷却" };
    case "fired":
      return { station: "display", text: "带成器到成器堂，验看并束草包装" };
    case "packed":
      return { station: "supply", text: "作品已入藏，可以开始下一件作品" };
  }
}
export function active(s: GameState) {
  return s.pieces.find((p) => p.id === s.activeId);
}
export function validateSave(input: unknown): GameState {
  if (!input || typeof input !== "object") throw new Error("不是窑火存档。");
  const s = input as GameState;
  if(s.kiln?.controlled!==undefined&&typeof s.kiln.controlled!=="boolean")throw new Error("烧制控制数据无效。");
  if(s.kiln?.power!==undefined&&(!Number.isFinite(s.kiln.power)||Math.abs(s.kiln.power)>1))throw new Error("烧制功率无效。");
  if(s.kiln?.controlled)s.kiln.power=0;
  if (s.version !== 1 || !Array.isArray(s.pieces) || s.pieces.length > 100)
    throw new Error("存档版本或作品数量不正确。");
  const vector = (a: unknown, len: number, min: number, max: number) =>
    Array.isArray(a) &&
    a.length === len &&
    a.every(
      (x) =>
        typeof x === "number" && Number.isFinite(x) && x >= min && x <= max,
    );
  const ids = new Set<string>();
  for (const p of s.pieces) {
    if (
      !p ||
      typeof p.id !== "string" ||
      !/^[\w-]{1,80}$/.test(p.id) ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      p.name.length > 80 ||
      !Object.hasOwn(STAGES, p.stage) ||
      !["bowl", "vase"].includes(p.form) ||
      !["held", "ground", ...STATIONS.map((s) => s.id)].includes(p.location) ||
      typeof p.opened !== "boolean" ||
      typeof p.footClean !== "boolean" ||
      !["front", "middle", "back"].includes(p.kilnPosition)
    )
      throw new Error("作品字段不完整。");
    ids.add(p.id);
    if(p.handles!==undefined&&![0,1,2].includes(p.handles))throw new Error('器耳数据无效。');
    if(p.decoration!==undefined&&!validDecoration(p.decoration))throw new Error("彩绘图层数据无效。");
    if(p.wheelTraces!==undefined && (!Array.isArray(p.wheelTraces)||p.wheelTraces.length>128||p.wheelTraces.some(t=>
      !t||![t.v,t.width,t.depth].every(Number.isFinite)||t.v<0||t.v>1||t.width<.001||t.width>.04||t.depth<0||t.depth>.0005)))
      throw new Error('轮制接触记录无效。');
    if (
      !vector(p.radius, 48, 0.025, 0.26) ||
      !vector(p.thickness, 48, 0.001, 0.05) ||
      !vector(p.glaze, 192, 0, 2) ||
      !vector(p.position, 3, -100, 100) ||
      !Number.isFinite(p.height) ||
      p.height < 0.08 ||
      p.height > 0.5
    )
      throw new Error("器形或釉层数据无效。");
    for (const key of [
      "moisture",
      "purity",
      "air",
      "preparation",
      "trimmed",
      "dryTime",
      "heat",
      "peak",
      "stress",
      "shrink",
      "score",
      "created",
    ] as const)
      if (!Number.isFinite(p[key]) || p[key] < 0 || p[key] > 1e14)
        throw new Error("工艺参数无效。");
    if (
      !Array.isArray(p.marks) ||
      p.marks.length > 6000 ||
      p.marks.some(
        (m) =>
          !m ||
          !["brush", "leaf", "flower", "wave", "band"].includes(m.kind) ||
          ![m.u, m.v, m.size, m.ink].every(Number.isFinite) ||
          m.u < 0 ||
          m.u > 1 ||
          m.v < 0 ||
          m.v > 1 ||
          m.size < 0 ||
          m.size > 0.2 ||
          m.ink < 0 ||
          m.ink > 1,
      )
    )
      throw new Error("笔触数据无效。");
    if (
      !Array.isArray(p.history) ||
      p.history.length > 1000 ||
      p.history.some((x) => typeof x !== "string") ||
      !Array.isArray(p.defects) ||
      p.defects.some((x) => typeof x !== "string")
    )
      throw new Error("作品记录无效。");
  }
  if (
    (s.activeId !== null && !ids.has(s.activeId)) ||
    (s.held !== null &&
      !ids.has(s.held) &&
      !["brush", "knife", "sagger", "bamboo"].includes(s.held)) ||
    !vector(s.player, 3, -30, 30) ||
    !Number.isFinite(s.yaw) ||
    !Number.isSafeInteger(s.day) ||
    s.day < 1
  )
    throw new Error("角色存档无效。");
  const carried = s.pieces.filter((p) => p.location === "held");
  if (
    carried.length > 1 ||
    carried.some((p) => p.id !== s.held) ||
    (s.held && ids.has(s.held) && !carried.length)
  )
    throw new Error("手持作品记录不一致。");
  if (
    !s.kiln ||
    !["idle", "firing", "cooling"].includes(s.kiln.phase) ||
    !vector(
      [s.kiln.temperature, s.kiln.fuel, s.kiln.draft, s.kiln.elapsed],
      4,
      0,
      1e7,
    ) ||
    !Array.isArray(s.kiln.curve) ||
    s.kiln.curve.length > 20000 ||
    s.kiln.curve.some((v) => !vector(v, 2, 0, 1e7))
  )
    throw new Error("窑炉记录无效。");
  const defaults = newState();
  s.settings = {
    ...defaults.settings,
    ...s.settings,
    bindings: { ...defaults.settings.bindings, ...s.settings?.bindings },
  };
  for (const key of ["sound", "bob", "assist", "subtitles"] as const)
    if (typeof s.settings[key] !== "boolean")
      s.settings[key] = defaults.settings[key];
  const bindings = Object.keys(defaults.settings.bindings).map(
    (key) => s.settings.bindings[key],
  );
  if (
    bindings.some(
      (value) => typeof value !== "string" || !/^Key[A-Z]$/.test(value),
    ) ||
    new Set(bindings).size !== bindings.length
  )
    throw new Error("按键设置包含冲突或无效的键。");
  s.settings.bindings = Object.fromEntries(
    Object.keys(defaults.settings.bindings).map((key) => [
      key,
      s.settings.bindings[key],
    ]),
  );
  s.settings.sensitivity = clamp(Number(s.settings.sensitivity) || 1, 0.2, 3);
  s.settings.volume = clamp(Number(s.settings.volume) || 0, 0, 1);
  s.settings.quality = s.settings.quality === "low" ? "low" : "high";
  for (const key of Object.keys(defaults.props))
    if (!s.props || !vector(s.props[key], 3, -30, 30))
      throw new Error("道具位置无效。");
  return s;
}
