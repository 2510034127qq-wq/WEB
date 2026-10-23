import "./ui/styles.css";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { CraftControls, type CraftHit } from "./render/craft-controls";
import { Workshop } from "./render/workshop";
import { applyLightingAudit } from "./render/lighting-audit";
import { Physics } from "./physics/world";
import { Sound } from "./render/sound";
import { Locomotion } from "./simulation/locomotion";
import {
  active,
  advance,
  addMark,
  clamp,
  dip,
  glazeMean,
  lightKiln,
  loadKiln,
  newPiece,
  newState,
  nextTask,
  openClay,
  placeAt,
  prepare,
  shape,
  smooth,
  STAGES,
  STATIONS,
  stretch,
  trim,
  validateSave,
  type GameState,
  type Mark,
  type Piece,
  type StationId,
  type Vec3,
} from "./simulation/model";
import { download, restore, save } from "./simulation/storage";

const $ = <T extends HTMLElement = HTMLElement>(q: string) =>
  document.querySelector<T>(q)!;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const root = $("#app");
root.innerHTML = `<div id="world" aria-label="三维工坊"></div><div id="vignette"></div>
<div id="hud" class="hidden"><div class="topbar"><div class="brand"><div class="seal">窑<br>火</div><div><strong>窑火</strong><small>JINGDEZHEN · 1743</small></div></div><nav class="topnav"><button data-act="map">工坊图 <small>M</small></button><button data-act="journal">手艺札记 <small>J</small></button><button data-act="collection">藏器</button><button data-act="settings">设置</button></nav></div><div class="objective"><div class="eyebrow" id="day">第一日 · 入窑之前</div><div class="objective-title" id="objective"></div><button data-act="guide">循着工序，去下一处 ↗</button></div><div class="crosshair"></div><div id="prompt" class="hidden"></div><div id="caption"></div><div class="bottom-left" id="control-hint">W A S D 行走 · 鼠标 看向 · E 操作 · Q 放下 · Esc 松开视角</div><div class="bottom-right" id="save-status">本地工坊 · 自动存档</div></div>
<div id="intro" class="intro"><div class="intro-content"><div class="eyebrow">景德镇 · 清代民间工坊</div><h1>窑火</h1><div class="tagline">一抔泥，一器一生。</div><p>从水土相和，到掌中成形。<br>让你的指痕与笔意，留在一窑青花里。</p><button id="start" class="primary" disabled>正在开启工坊</button><div id="loading" class="small-note" style="margin-top:18px">整理坯房与工具…</div><div class="loading-line"></div></div><div class="edition">一器一生 / THE LIFE OF PORCELAIN &nbsp; — &nbsp; v1.1.0-preview.2</div><div class="intro-aside">真实三维 · 自由制瓷<br>建议桌面 Chrome · 戴上耳机</div></div>
<aside id="work" class="work-panel hidden"></aside><div id="toolbar" class="work-toolbar hidden"></div><div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div><input type="file" id="import" accept="application/json,.json" hidden/>`;

let state: GameState = newState(),
  game: Workshop,
  physics: Physics;
const sound = new Sound();
let controls: CraftControls;
let controlDrag: CraftHit | null = null;
let wheelGrabAngle: number | null = null;
const locomotion = new Locomotion();
let lastCarriedBump = -10;
let started = false,
  modal = "",
  paused = true,
  yaw = 0,
  pitch = 0,
  focus: StationId | null = null,
  form: "bowl" | "vase" = "bowl";
let dragging = false,
  lastX = 0,
  lastY = 0,
  ring = 24,
  tool: Mark["kind"] = "brush",
  brushSize = 0.014,
  ink = 0.75,
  water = 0.65,
  depth = 0,
  pressure = 0.5,
  spin = 0,
  hold = "",
  holdTimer = 0,
  nav: Vec3[] = [],
  lastTime = 0,
  elapsed = 0,
  uiTimer = 0,
  saveTimer = 0,
  lastStage = "",
  saved = true,
  toastTimer = 0,
  remap: string | null = null,
  restorePointer = false;
const keys = new Set<string>();
let editRevision = 0;
let shapeUndo: Pick<Piece,'radius'|'thickness'|'height'|'wheelTraces'>[] = [];
let frames: number[] = [];
let packing: string | null = null,
  packingTime = 0;
function toast(message: string) {
  $("#toast").textContent = message;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ($("#toast").textContent = ""), 4300);
}
function dirty() {
  editRevision++;
  saved = false;
  game?.sync();
}
async function persist() {
  if (!started) return false;
  const revision = editRevision;
  try {
    await save(state);
    saved = revision === editRevision;
    $("#save-status").textContent = saved ? "已保存于此浏览器" : "有新改动 · 等待自动保存";
    return true;
  } catch (e) {
    $("#save-status").textContent = "存档失败 · 请导出备份";
    toast("无法写入本地存档，请在设置中导出备份。");
    return false;
  }
}
function leave() {
  wheelGrabAngle = null;
  controls?.endDrag();
  controlDrag = null;
  packing = null;
  document.body.classList.remove("at-work");
  delete document.body.dataset.station;
  depth = 0;
  opening = 0;
  cleanTravel = 0;
  contactValid = false;
  controls?.setFocus(null);
  locomotion.reset(yaw);
  focus = null;
  game.focus = null;
  game.contact = null;
  $("#work").classList.add("hidden");
  $("#toolbar").classList.add("hidden");
  spin = 0;
  hold = "";
  dragging = false;
  shapeUndo = [];
  keys.clear();
  pitch = 0;
  dirty();
}
function nearest() {
  return STATIONS.map((s) => ({
    s,
    d: Math.hypot(
      s.approach[0] - state.player[0],
      s.approach[2] - state.player[2],
    ),
  })).sort((a, b) => a.d - b.d)[0];
}
function release() {
  controls?.endDrag();
  controlDrag = null;
  if (document.pointerLockElement) document.exitPointerLock();
  keys.clear();
  dragging = false;
  hold = "";
}
async function lock() {
  if (!focus && !modal && started) {
    sound.start();
    try {
      await game.renderer.domElement.requestPointerLock();
    } catch {
      toast("可按住鼠标右键转动视角；WASD 仍可行走。");
    }
  }
}
function go(station: StationId) {
  leave();
  closeModal();
  const target = STATIONS.find((s) => s.id === station)!;
  const start = [...state.player] as Vec3;
  // All guided paths use the clear central lanes, with the same collision controller.
  const safeZ = clamp(start[2], -3.5, 3.0);
  nav = [
    [clamp(start[0], -5.5, 5.3), 1.65, safeZ],
    [clamp(start[0], -4.4, 4.0), 1.65, 1],
    [clamp(target.approach[0], -4.4, 4.0), 1.65, 1],
    [target.approach[0], 1.65, target.approach[2]],
  ];
  toast(`前往${target.name} · 按任意移动键可接管`);
}
function interact() {
  if (modal || !started) return;
  if (focus) {
    leave();
    void lock();
    return;
  }
  const ground = state.pieces.find(
    (p) =>
      p.location === "ground" &&
      Math.hypot(
        p.position[0] - state.player[0],
        p.position[2] - state.player[2],
      ) < 1.7,
  );
  if (ground && !state.held) {
    state.activeId = ground.id;
    takePiece();
    return;
  }
  const prop = game.nearbyProp();
  if (prop && !state.held) {
    state.held = prop;
    sound.tap();
    toast(
      `已拿起${{ brush: "毛笔", knife: "利坯刀", sagger: "匣钵", bamboo: "竹杖" }[prop]} · Q 放在指向的平面`,
    );
    dirty();
    return;
  }
  const n = nearest();
  if (n.d > 2.2) {
    toast("走近工作台，再按 E。");
    return;
  }
  enter(n.s.id);
}
function enter(id: StationId) {
  let p = active(state);
  if (state.held && p && state.held === p.id) {
    try {
      placeAt(p, id, state);
      state.held = null;
      sound.tap();
    } catch (e) {
      toast((e as Error).message);
      return;
    }
  }
  if (state.held && state.held !== p?.id) {
    toast("请先按 Q 把工具放回平面，再操作工作台。");
    return;
  }
  const here = state.pieces.filter(
    (p) => p.location === id && p.stage !== "packed",
  );
  if (here.length && (!p || p.location !== id)) {
    state.activeId = here[0].id;
    p = here[0];
  }
  nav = [];
  focus = id;
  document.body.dataset.station = id;
  locomotion.reset(yaw);
  game.focus = id;
  game.rotation = id === "display" ? Math.PI : 0;
  controls?.setFocus(id);
  depth = 0;
  opening = 0;
  release();
  paused = false;
  renderWork();
  dirty();
}
function takePiece() {
  const p = active(state);
  if (!p) return;
  if (focus && p.location !== focus) {
    toast("走到器物所在的工作台，再托起它。");
    return;
  }
  if (state.held && state.held !== p.id) {
    toast("双手已持有工具，请先放下。");
    return;
  }
  if (p.stage === "loaded") {
    toast("匣钵已装窑，烧成并冷却后再取出。");
    return;
  }
  p.location = "held";
  state.held = p.id;
  leave();
  sound.tap("wood");
  toast("双手托稳坯板 · 到下一工作台按 E 放下");
  dirty();
}
function drop() {
  if (!state.held) return;
  const point = game.placement();
  if (!point) {
    toast("看向近处的桌面或地面，再按 Q 放下。");
    return;
  }
  const p = state.pieces.find((p) => p.id === state.held);
  if (p) {
    p.location = "ground";
    p.position = point;
  } else {
    state.props[state.held] = point;
    physics.releaseProp(state.held, point);
  }
  state.held = null;
  dirty();
  sound.tap();
}
function range(
  id: string,
  title: string,
  min: number,
  max: number,
  step: number,
  value: number,
) {
  return `<label for="${id}">${title}<span class="value" id="${id}-value">${value}</span></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
}
const button = (act: string, label: string, cls = "") =>
  `<button class="${cls}" data-act="${act}">${label}</button>`;
function renderWork() {
  if (!focus) return;
  const station = STATIONS.find((s) => s.id === focus)!;
  const p = active(state),
    here = p?.location === focus;
  let hint = "",
    detail = "",
    extras = "";
  if (focus === "supply") {
    hint = "伸手取桌上的泥团";
    detail = `1 碗 / 2 瓶 · 当前意向：${form === "bowl" ? "碗" : "瓶"}，器形由手塑出`;
  } else if (!here && !["kiln", "rack"].includes(focus)) {
    hint = "案上没有坯体";
    detail = nextTask(p).text;
  } else if (focus === "clay") {
    hint = "掌心压住泥团，前推、回折，再推";
    detail = "移动双手才会排气 · 点清水碗润手 · F 托起";
  } else if (focus === "wheel" && p) {
    hint = ["leather", "trimmed"].includes(p.stage)
      ? "刀锋贴住坯壁，随转轮轻轻旋削"
      : p.opened
        ? "扶住器壁左右收放，向上慢提"
        : "拖动轮缘拨轮，再压住泥心向下开孔";
    detail = "空格拨轮 · B 扶轮制动 · Shift 拖动抹平 · Ctrl+Z 撤回 · F 托起";
  } else if (focus === "paint") {
    hint = "笔尖落在坯面，拖动留下青料";
    detail =
      "点砚台蘸料 / 水碗洗笔 · 滚轮旋器 · Shift+滚轮调笔锋 · Ctrl+Z 撤回 · F 托起";
  } else if (focus === "glaze") {
    hint = "抓住器物下拉入釉，上提离釉";
    detail = "浸入深度与停留决定釉层 · 取出后按右键在底足来回擦拭 · F 托起";
  } else if (focus === "rack") {
    hint = "置于阴处，等坯体慢慢失水";
    detail = "按住 R 静候 · F 托起当前器物";
    extras = state.pieces
      .filter((q) => q.location === "rack")
      .map((q) => button("select-" + q.id, esc(q.name)))
      .join("");
  } else if (focus === "kiln") {
    hint = "把柴送入火口，拨开风闸观火";
    detail =
      "拖砖至窑口安置匣钵 · 拖火折子到火口起火 · 拖木柴入炉 · 拖风闸调风 · C 止火 · R 静候";
    extras =
      '<div class="craft-readout" id="kiln-temp"></div><div id="kiln-fuel" hidden></div><svg hidden><polyline id="curve"/></svg>';
  } else if (focus === "display" && p) {
    hint = "对光验器，拢纸轻裹";
    detail = "滚轮旋看 · 将纸向器物拢合，松手停下";
    extras = `<details><summary>器物记录与导出</summary><input class="rename" id="piece-name" value="${esc(p.name)}" maxlength="60" aria-label="作品名称"><p>${p.score} 分 · ${p.defects.length ? p.defects.map(esc).join("、") : "釉面匀净"}</p>${button("export-glb", "导出 GLB")}${button("photo", "留影")}${button("unwrap", "解纸验看")}</details>`;
  }
  $("#work").innerHTML =
    `<div class="work-heading"><div><div class="eyebrow">${station.subtitle}</div><h2>${station.name}</h2></div></div><p class="gesture-instruction">${hint}</p><div class="small-note">${detail}</div><div id="hand-status" aria-live="off"></div>${extras}`;
  $("#work").classList.remove("hidden");
  $("#toolbar").classList.add("hidden");
  $("#prompt").classList.add("hidden");
  document.body.classList.add("at-work");
}
function closeModal() {
  modal = "";
  $("#modal-root").innerHTML = "";
  paused = false;
  keys.clear();
  if (focus) renderWork();
  else if (restorePointer) void lock();
  restorePointer = false;
}
function openModal(kind: string) {
  restorePointer = !!document.pointerLockElement;
  release();
  modal = kind;
  paused = kind === "settings";
  let title = "",
    content = "";
  if (kind === "map") {
    title = "一院，八处手艺";
    const order = [
      "clay",
      "wheel",
      "paint",
      "rack",
      "center",
      "glaze",
      "supply",
      "display",
      "kiln",
    ];
    content = `<p>循工序慢慢走，或点一处工作区自动引路。引路沿着院中通道行走，可随时用 WASD 接管。</p><div class="map-grid">${order
      .map((id) => {
        const s = STATIONS.find((s) => s.id === id);
        return s
          ? `<button data-act="go-${s.id}"><small>${s.number} · ${s.subtitle}</small><strong>${s.name} ↗</strong></button>`
          : '<div class="map-center">天光入院</div>';
      })
      .join(
        "",
      )}</div><p class="small-note">北为坯房，南接原料房与公共窑棚。多个历史作业空间在此压缩为连通院落。</p>`;
  }
  if (kind === "journal") {
    title = "手艺札记";
    content = `<div class="eyebrow">水土 · 双手 · 窑火</div><p>这里取意于清代景德镇民间制瓷。真实产业分工精细：原料行、坯房、画作与窑场，并非一位匠人、一间屋子包办。这个院落将它们连在一起，让你亲历一件青花的生命。</p><div class="note-grid"><section><h3>一 · 从泥到坯</h3><p>瓷石、高岭土经过破碎、淘洗、沉降与脱水，再配泥陈腐。本作领取的是已预处理的泥块；你仍须调水、揉练排气。轮车靠竹杖起动，双手塑形。</p></section><section><h3>二 · 干湿之间</h3><p>湿坯柔软，不能立即利坯。放到阴干架候至半干，才用刀旋削。不能用强晒或窑火代替恰当干燥。</p></section><section><h3>三 · 釉下青花</h3><p>青料研细后画在坯上，再施透明釉并高温烧成。青花主线无需强行插入素烧，也不必都做第二次彩烧。</p></section><section><h3>四 · 窑中有性</h3><p>匣钵减少窑灰与火焰污染。窑位、温度历程、坯壁与釉层共同影响结果。烧窑与冷却跨日，游戏用时间推进压缩等待。</p></section></div><h3>把手艺留在器物上</h3><p>练泥：按住泥团来回推揉。拉坯：拖轮缘拨轮，压住泥心下拉开孔，再沿器壁横向收放、纵向提拉。利坯：转轮后让刀尖接触器壁，离开就停刀。画坯：直接在三维表面落笔，点砚台蘸料、点水碗稀释。施釉：抓住器物下拖入釉、上提离釉，右键擦净底足。窑前拖封砖、火折子和柴到窑口，拖风闸调风。持物走到工作台按 E 放下；看向近处平面按 Q 可自由放置。</p><h3>考证与边界</h3><p>工序参考唐英《陶冶图说》及故宫资料，场景为合成工坊。泥体、烧成参数和缺陷是可解释的游戏近似，未经真实配方试验校准；桌面双手采用动作约束，不是独立六自由度输入。</p><p><a href="https://www.dpm.org.cn/Uploads/File/2020/04/22/u5e9ffd0d381f6.pdf" target="_blank" rel="noopener">故宫博物院 · 唐英与《陶冶图说》</a> &nbsp; / &nbsp; <a href="https://whc.unesco.org/en/list/1765/" target="_blank" rel="noopener">景德镇手工瓷业遗产资料</a></p>`;
  }
  if (kind === "settings") {
    title = "工坊设置";
    const set = state.settings;
    content = `<div class="settings-grid"><div><label>环境声音 <input id="sound" type="checkbox" ${set.sound ? "checked" : ""}></label><label>音量 <input id="volume" type="range" min="0" max="1" step="0.05" value="${set.volume}"></label><label>画面质量 <select id="quality"><option value="high" ${set.quality === "high" ? "selected" : ""}>高 · 细节与阴影</option><option value="low" ${set.quality === "low" ? "selected" : ""}>轻 · 降低像素成本</option></select></label><label>视角灵敏度 <input id="sensitivity" type="range" min="0.2" max="3" step="0.1" value="${set.sensitivity}"></label><label>行走晃动 <input id="bob" type="checkbox" ${set.bob ? "checked" : ""}></label><label>工艺字幕 <input id="subtitles" type="checkbox" ${set.subtitles ? "checked" : ""}></label></div><div><label>默认师傅扶火 <input id="assist" type="checkbox" ${set.assist ? "checked" : ""}></label>${Object.entries(
      set.bindings,
    )
      .map(
        ([k, v]) =>
          `<label>${{ forward: "向前", back: "向后", left: "向左", right: "向右", interact: "操作", drop: "放下", journal: "札记", map: "工坊图" }[k]} <button data-act="bind-${k}" class="small">${esc(v.replace("Key", ""))}</button></label>`,
      )
      .join(
        "",
      )}</div></div><h3>把作品带走</h3><p>工坊和作品自动保存在此浏览器的 IndexedDB。清除浏览器数据会清除本地存档。可导出完整备份，在其他浏览器中导入。</p><div class="row">${button("backup", "导出工坊备份")}${button("import", "导入备份")}${button("save", "立即保存")}</div><p class="small-note">打开设置时工艺时间暂停。桌面键鼠优先；窄屏可查看与引路，完整自由操作建议使用键盘鼠标。</p>`;
  }
  if (kind === "collection") {
    title = "藏器 · 每一器都有来路";
    const items = state.pieces.filter((p) =>
      ["packed", "fired"].includes(p.stage),
    );
    content = items.length
      ? `<div class="collection">${items
          .map((p) => {
            const outline = p.radius
              .map((r, i) => `${100 + r * 270},${130 - (i / 47) * 110}`)
              .join(" ");
            const inside = [...p.radius]
              .reverse()
              .map((r, i) => `${100 - r * 270},${20 + (i / 47) * 110}`)
              .join(" ");
            return `<article><svg class="silhouette" viewBox="0 0 200 150"><defs><linearGradient id="g-${p.id}"><stop stop-color="#9baea6"/><stop offset=".4" stop-color="#e1e9df"/><stop offset="1" stop-color="#708a81"/></linearGradient></defs><polygon points="${outline} ${inside}" fill="url(#g-${p.id})"/></svg><div class="grade">${p.score >= 85 ? "上品" : p.score >= 60 ? "良品" : "习器"} · ${p.score} / 100</div><h3>${esc(p.name)}</h3><p>${p.marks.length} 笔 · ${p.defects.length ? p.defects.length + " 项窑变记录" : "釉净器正"}</p>${button("view-" + p.id, "对光看器 ↗")}${button("record-" + p.id, "工艺记录", "small")}</article>`;
          })
          .join("")}</div>`
      : "<p>还没有出窑的作品。第一团泥已经在原料房等你。</p>";
  }
  if (kind === "journal")
    content += `<h3>素材署名</h3><p><a href="https://www.fab.com/listings/f19a85c6-1938-4a95-8ecc-ee7bc72767d8" target="_blank" rel="noopener">Hanging Ancient Pottery Set — Glowbox3D</a>；<a href="https://www.fab.com/listings/81a65096-1e1b-4133-9c69-3acf87398248" target="_blank" rel="noopener">Firewood Pile Scan LOWPOLY — sixonetwo</a>；<a href="https://www.fab.com/listings/c9b121d9-4dd7-43fa-9086-9d5854fa0ada" target="_blank" rel="noopener">Hands — StorePage</a>。均依 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> 使用，作比例、场景摆放或骨架适配。作者不为本作背书。实拍材质、天空与叶图来自 <a href="https://polyhaven.com/license" target="_blank" rel="noopener">Poly Haven（CC0）</a>；泥土与工具表面使用 <a href="https://ambientcg.com/" target="_blank" rel="noopener">ambientCG（CC0）</a>。</p>`;
  $("#modal-root").innerHTML =
    `<div class="modal-wrap"><section class="modal" role="dialog" aria-modal="true" aria-label="${title}"><div class="modal-head"><h2>${title}</h2>${button("close-modal", "关闭 ×")}</div>${content}</section></div>`;
  $("#modal-root button")?.focus();
}
async function exportGlb() {
  const p = active(state);
  if (!p) return;
  const ceramic = game.ceramics.get(p.id)!;
  const object = new THREE.Group();
  object.add(ceramic.mesh.clone());
  object.scale.setScalar(p.shrink);
  object.name = p.name;
  object.userData = {
    title: p.name,
    history: p.history,
    defects: p.defects,
    units: "metres",
    source: "Yaohuo v1.1.0-preview.2",
  };
  const output = await new GLTFExporter().parseAsync(object, { binary: true });
  download(
    new Blob([output as ArrayBuffer], { type: "model/gltf-binary" }),
    `窑火-${p.name}.glb`,
  );
  toast("已导出包含器形、青花贴图与工艺记录的 GLB。");
}
function capture() {
  game.renderer.domElement.toBlob((blob) => {
    if (blob) download(blob, `窑火-${active(state)?.name || "工坊"}.png`);
  });
  toast("已保存当前三维画面。");
}

root.addEventListener("click", async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!b) return;
  const act = b.dataset.act!;
  sound.start();
  const p = active(state);
  try {
    if (["map", "journal", "collection", "settings"].includes(act)) {
      openModal(act);
      return;
    }
    if (act.startsWith("go-")) {
      go(act.slice(3) as StationId);
      return;
    }
    if (act.startsWith("tool-")) {
      tool = act.slice(5) as Mark["kind"];
      renderWork();
      return;
    }
    if (act.startsWith("bind-")) {
      remap = act.slice(5);
      b.textContent = "按一个键…";
      return;
    }
    if (act.startsWith("view-")) {
      if (state.held) {
        toast("请先放好手中的物品，再去验看藏器。");
        return;
      }
      state.activeId = act.slice(5);
      game.packId = null;
      go("display");
      return;
    }
    if (act.startsWith("select-")) {
      state.activeId = act.slice(7);
      renderWork();
      return;
    }
    if (act.startsWith("record-")) {
      const q = state.pieces.find((p) => p.id === act.slice(7))!;
      toast(q.history.join(" → "));
      return;
    }
    switch (act) {
      case "close-modal":
        closeModal();
        break;
      case "leave":
        leave();
        void lock();
        break;
      case "guide":
        go(nextTask(p).station);
        break;
      case "take":
        takePiece();
        break;
      case "form-bowl":
        form = "bowl";
        renderWork();
        break;
      case "form-vase":
        form = "vase";
        renderWork();
        break;
      case "new":
        if (state.pieces.length >= 100)
          throw new Error("工坊已达 100 件容量，请先导出备份。");
        {
          const q = newPiece(form, state.pieces.length + 1);
          state.pieces.push(q);
          state.activeId = q.id;
          shapeUndo = [];
          takePiece();
          toast("领取原泥 · 下一处：淘练台");
        }
        break;
      case "open":
        if (p) {
          openClay(p);
          spin = 0.75;
          sound.tap();
          renderWork();
        }
        break;
      case "smooth":
        if (p) smooth(p);
        break;
      case "undo-shape":
        if (p && shapeUndo.length) Object.assign(p, shapeUndo.pop());
        break;
      case "spin":
        spin = spin ? 0 : 0.75;
        break;
      case "shape-in":
      case "shape-out":
        if (p) {
          shapeUndo.push({
            radius: [...p.radius],
            wheelTraces: structuredClone(p.wheelTraces||[]),
            thickness: [...p.thickness],
            height: p.height,
          });
          shape(p, ring, act === "shape-in" ? -0.004 : 0.004, pressure);
          game.workMotion = ring / 47;
        }
        break;
      case "undo-paint":
        if (p) {
          let count = 0;
          do {
            p.marks.pop();
            count++;
          } while (
            p.marks.length &&
            !p.marks[p.marks.length - 1].end &&
            count < 1000
          );
        }
        break;
      case "rotate-left":
        game.rotation -= Math.PI / 6;
        break;
      case "rotate-right":
        game.rotation += Math.PI / 6;
        break;
      case "clean-foot":
        if (p && p.stage === "glazed") {
          if (!p.footClean) p.history.push("湿布擦净底足接触面。");
          p.footClean = true;
          renderWork();
          toast("底足已净，放回阴干架候干。");
        } else toast("先施釉，再擦底足。");
        break;
      case "wash-glaze":
        if (p) {
          p.glaze.fill(0);
          p.footClean = false;
          p.stage = p.marks.length ? "painted" : "trimmed";
          renderWork();
        }
        break;
      case "load":
        if (p) {
          loadKiln(state, p);
          renderWork();
          toast("干坯已装入匣钵。");
        }
        break;
      case "light":
        lightKiln(state);
        toast("窑门封定，起火。等火候足，再自然冷却。");
        renderWork();
        break;
      case "fuel":
        if (state.kiln.phase === "firing") {
          state.kiln.fuel = clamp(state.kiln.fuel + 0.3, 0, 1);
          sound.tap();
        } else toast("起火后再添柴。");
        break;
      case "cool":
        if (state.kiln.phase === "firing") {
          state.kiln.phase = "cooling";
          toast("已止火。窑器自然冷却后才可取出。");
        }
        break;
      case "pack":
        if (p?.stage === "fired" && !packing) {
          packing = p.id;
          packingTime = 0;
          game.packId = p.id;
          game.packProgress = 0;
          toast("纸覆器身，草绳轻束。");
        }
        break;
      case "unwrap":
        game.packId = null;
        renderWork();
        toast("解开纸草，对光验看。");
        break;
      case "export-glb":
        await exportGlb();
        break;
      case "photo":
        capture();
        break;
      case "backup":
        download(
          new Blob([JSON.stringify(state, null, 2)], {
            type: "application/json",
          }),
          "窑火-工坊备份.json",
        );
        break;
      case "import":
        $("#import").click();
        break;
      case "save": {
        const saveButton=b as HTMLButtonElement, label=saveButton.textContent;
        saveButton.disabled=true;saveButton.textContent="正在写入…";
        $("#save-status").textContent="正在写入本地存档…";
        try {if(await persist())toast("工坊已保存。");}
        finally {saveButton.disabled=false;saveButton.textContent=label;}
        return;
      }
    }
    dirty();
  } catch (err) {
    toast((err as Error).message);
  }
});
root.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  const p = active(state);
  const value = Number(t.value);
  const label = $("#" + t.id + "-value");
  if (label) label.textContent = t.value;
  if (t.id === "water") {
    water = value;
    if (p?.stage === "prepared") p.moisture = value;
  }
  if (t.id === "height" && p) stretch(p, value);
  if (t.id === "pressure") pressure = value;
  if (t.id === "trim-ring") ring = value;
  if (t.id === "brush-size") brushSize = value;
  if (t.id === "ink") ink = value;
  if (t.id === "depth") depth = value;
  if (t.id === "draft") state.kiln.draft = value;
  if (t.id === "kiln-pos" && p)
    p.kilnPosition = t.value as Piece["kilnPosition"];
  if (t.id === "assist-kiln") state.kiln.assisted = t.checked;
  if (["sound", "bob", "subtitles", "assist"].includes(t.id))
    (state.settings as unknown as Record<string, unknown>)[t.id] = t.checked;
  if (["volume", "sensitivity"].includes(t.id))
    (state.settings as unknown as Record<string, unknown>)[t.id] = value;
  if (t.id === "quality") {
    state.settings.quality = t.value as "high" | "low";
    game.setQuality();
  }
  if (t.id === "piece-name" && p) p.name = t.value || "无名器";
  dirty();
});
$("#import").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    if (f.size > 15e6) throw new Error("存档太大，上限为 15 MB。");
    const incoming = validateSave(JSON.parse(await f.text()));
    download(
      new Blob([JSON.stringify(state)], { type: "application/json" }),
      "窑火-导入前备份.json",
    );
    state = incoming;
    game.state = state;
    game.sync();
    yaw = state.yaw;
    physics.restoreProps(state.props);
    physics.body.setTranslation(
      { x: state.player[0], y: 0.85, z: state.player[2] },
      true,
    );
    leave();
    closeModal();
    await persist();
    toast("备份已恢复，原工坊已自动导出备份。");
  } catch (err) {
    toast("导入失败：" + (err as Error).message);
  }
  (e.target as HTMLInputElement).value = "";
});

let rightDrag = false;
let gestureTravel = 0,
  opening = 0,
  cleanTravel = 0;
let contactValid = false;

root.addEventListener("pointerdown", (e) => {
  const h = (e.target as HTMLElement).closest<HTMLElement>("[data-hold]");
  if (h) {
    hold = h.dataset.hold!;
    holdTimer = 0;
    h.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
});
window.addEventListener("pointerup", () => {
  wheelGrabAngle = null;
  if (controlDrag) {
    const action = controls.endDrag();
    try {
      if (action?.overTarget) {
        if (action.action === "kiln-seal") {
          const p = active(state);
          if (p?.stage === "dry" && p.location === "kiln") loadKiln(state, p);
        }
        if (action.action === "kiln-light") lightKiln(state);
        if (action.action === "kiln-fuel" && state.kiln.phase === "firing")
          state.kiln.fuel = clamp(state.kiln.fuel + 0.3, 0, 1);
      }
    } catch (e) {
      toast((e as Error).message);
    }
    controlDrag = null;
    dirty();
  }
  hold = "";
  rightDrag = false;
  if (dragging) {
    const p = active(state);
    if (p && focus === "paint" && p.marks.length)
      p.marks[p.marks.length - 1].end = true;
    dirty();
  }
  dragging = false;
});
window.addEventListener("pointercancel", () => {
  controls?.endDrag();
  controlDrag = null;
  hold = "";
  dragging = false;
  rightDrag = false;
});
function useControl(hit: CraftHit) {
  const p = active(state);
  controls.disturb(hit.action,performance.now()/1000+.3);
  if(['clay-water','wheel-water','paint-water','paint-ink'].includes(hit.action))
    game.reachTo(hit.point,hit.station==='paint'?1:0);
  try {
    if (hit.action === "supply-clay") {
      if (state.pieces.length >= 100)
        throw new Error("工坊已达容量，请导出备份。");
      const q = newPiece(form, state.pieces.length + 1);
      state.pieces.push(q);
      state.activeId = q.id;
      takePiece();
      toast("托稳泥团，去淘练台。");
    }
    if (["clay-water", "wheel-water"].includes(hit.action)) {
      water = clamp(water + 0.025, 0.35, 0.8);
      if (p && ["raw", "prepared", "thrown"].includes(p.stage))
        p.moisture = water;
      sound.tap("clay");
      toast("双手蘸水，湿润泥面。");
    }
    if (hit.action === "paint-ink") {
      ink = clamp(ink + 0.15, 0.15, 1);
      sound.tap("brush");
    }
    if (hit.action === "paint-water") {
      ink = clamp(ink - 0.15, 0.15, 1);
      sound.tap("brush");
    }
    if (hit.action === "kiln-seal")
      toast("把封窑砖送到窑口，安置干坯匣钵，再点火。");
    if (hit.action === "pack-paper" && p?.stage === "fired") {
      if (packing !== p.id) {
        packingTime = 0;
        game.packProgress = 0;
        controls.setValue("pack-paper", 0);
      }
      packing = p.id;
      game.packId = p.id;
    }
    dirty();
  } catch (e) {
    toast((e as Error).message);
  }
}
function markAt(x: number, y: number, first = false) {
  const p = active(state);
  if (!p) return;
  const hit = game.hitPiece(x, y);
  if (!hit?.uv) return;
  ring = Math.round(hit.uv.y * 47);
  game.workMotion = ring / 47;
  if (focus === "paint" && (first || tool === "brush")) {
    addMark(p, {
      u: hit.uv.x,
      v: hit.uv.y,
      size: brushSize,
      ink,
      kind: tool,
      surface: hit.surface,
      end: tool !== "brush",
    });
    dirty();
  }
}
window.addEventListener("mousemove", (e) => {
  if (!started || modal) return;
  if (wheelGrabAngle !== null) {
    const hit = game.hitWheel(e.clientX, e.clientY);
    if (hit) {
      const angle = Math.atan2(hit.point.x, hit.point.z + 5.6);
      const change = Math.atan2(
        Math.sin(angle - wheelGrabAngle),
        Math.cos(angle - wheelGrabAngle),
      );
      spin = clamp(spin + Math.abs(change) * 4, 0, 3.2);
      game.rotation += change;
      wheelGrabAngle = angle;
    }
    return;
  }
  if (focus && !dragging && !controlDrag) {
    const target = controls.hit(
      game.camera,
      e.clientX,
      e.clientY,
      innerWidth,
      innerHeight,
    );
    game.renderer.domElement.style.cursor = target ? "grab" : "crosshair";
    $("#caption").textContent =
      target?.label || STATIONS.find((s) => s.id === focus)!.subtitle;
  }
  if (focus === "paint") {
    const hit = game.hitPiece(e.clientX, e.clientY);
    if (hit?.face) {
      game.contact = hit.point.clone();
      game.contactNormal
        .copy(hit.face.normal)
        .transformDirection(hit.object.matrixWorld);
    }
  }
  if ((document.pointerLockElement || rightDrag) && !focus) {
    yaw -= e.movementX * 0.002 * state.settings.sensitivity;
    pitch = clamp(
      pitch - e.movementY * 0.002 * state.settings.sensitivity,
      -1.2,
      1.2,
    );
    state.yaw = yaw;
  }
  if (controlDrag) {
    const action = controls.drag(
      game.camera,
      e.clientX,
      e.clientY,
      innerWidth,
      innerHeight,
    );
    if (action) {
      if (action.action === "kiln-draft") {
        state.kiln.assisted = false;
        state.kiln.draft = clamp(action.value, 0.05, 1);
      }
      if (action.action === "glaze-dip") {
        depth = action.value;
        hold = depth > 0.01 ? "dip" : "";
      }
      if (action.action === "pack-paper" && packing) {
        packingTime = Math.max(packingTime, action.value * 2.8);
        game.packProgress = packingTime / 2.8;
      }
    }
    return;
  }
  if (dragging && focus) {
    const p = active(state);
    if (!p || p.location !== focus) return;
    const dx = e.clientX - lastX,
      dy = e.clientY - lastY;
    const distance = Math.hypot(dx, dy);
    gestureTravel += distance;
    const hit = game.hitPiece(e.clientX, e.clientY);
    contactValid = !!hit;
    if (hit?.face) {
      ring = Math.round(clamp(hit.uv.y, 0, 1) * 47);
      game.workMotion = ring / 47;
      game.contact = hit.point.clone();
      game.contactNormal
        .copy(hit.face.normal)
        .transformDirection(hit.object.matrixWorld);
    }
    if (focus === "clay" && hit && p.stage === "raw") {
      prepare(p, Math.min(distance, 35) * 0.008, water);
      game.workMotion = clamp(game.workMotion + dy * 0.007, 0, 1);
      hold = distance > 0 ? "knead" : "";
      if (gestureTravel > 90) {
        sound.tap("clay");
        gestureTravel = 0;
      }
      dirty();
    }
    if (focus === "wheel" && hit) {
      if (!p.opened && p.stage === "prepared" && spin > 0.4) {
        opening = clamp(opening + Math.max(0, dy) / 95, 0, 1);
        game.workMotion = 1 - opening * 0.8;
        if (opening >= 1) {
          try {
            openClay(p);
          } catch (error) {
            toast((error as Error).message);
            opening = 0;
          }
          renderWork();
          sound.tap("clay");
        }
      } else if (
        p.opened &&
        ["prepared", "thrown"].includes(p.stage) &&
        spin > 0.2
      ) {
        const bounds = game.activeBounds();
        const scale = p.height / Math.max(80, bounds?.h || 250);
        pressure = 0.45;
        if (keys.has("ShiftLeft") || keys.has("ShiftRight")) smooth(p);
        else {
          shape(p, hit.uv.y*47, dx * scale * 0.6, pressure, spin);
          if (Math.abs(dy) > Math.abs(dx) * 0.8)
            stretch(p, p.height - dy * scale * 0.25);
        }
        spin = Math.max(0, spin - distance * 0.001);
        dirty();
      }
    }
    if (focus === "glaze") {
      if (rightDrag) {
        if (hit && hit.uv.y < 0.22 && depth < 0.08 && p.stage === "glazed") {
          cleanTravel += distance;
          if (cleanTravel > 100 && !p.footClean) {
            p.footClean = true;
            p.history.push("手持湿布沿圈足来回擦净。");
            toast("圈足已擦净，可托起候干。");
            dirty();
          }
        }
      } else {
        depth = clamp(depth + dy / 240, 0, 1);
        hold = depth > 0.01 ? "dip" : "";
      }
    }
    if (focus === "paint" && !rightDrag) markAt(e.clientX, e.clientY);
    lastX = e.clientX;
    lastY = e.clientY;
  }
});
window.addEventListener("keydown", (e) => {
  if (remap) {
    e.preventDefault();
    if (e.code === "Escape") {
      remap = null;
      openModal("settings");
      return;
    }
    if (["KeyF", "KeyB", "KeyC", "KeyR", "KeyZ"].includes(e.code)) {
      toast("此键保留给托器、制动、止火、等候或撤回，请换一个键。");
      return;
    }
    if (
      ["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "KeyJ", "KeyM"].includes(
        e.code,
      ) ||
      e.code.startsWith("Key")
    ) {
      const conflict = Object.entries(state.settings.bindings).find(
        ([k, v]) => v === e.code && k !== remap,
      );
      if (conflict) {
        toast("此键已用于另一项操作，请换一个键。");
        return;
      }
      state.settings.bindings[remap] = e.code;
      remap = null;
      openModal("settings");
      dirty();
    }
    return;
  }
  if ((e.target as HTMLElement).matches("input,select,textarea")) return;
  if (e.code === "Escape") {
    if (modal) closeModal();
    else if (focus) leave();
    else if (!document.pointerLockElement && started) openModal("settings");
    return;
  }
  if (modal) {
    if (e.code === "Tab") {
      const all = [
        ...document.querySelectorAll<HTMLElement>(
          ".modal button,.modal input,.modal select,.modal a",
        ),
      ];
      const first = all[0],
        last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
    return;
  }
  if (!started) return;
  const bind = state.settings.bindings;
  if (
    Object.values(bind).includes(e.code) ||
    ["ShiftLeft", "ControlLeft", "Space"].includes(e.code)
  )
    e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (focus) {
    const p = active(state);
    if (e.code === "KeyF") {
      if (focus === "glaze" && depth > 0.05) toast("先把器物提离釉面。");
      else takePiece();
    }
    if (e.code === "Space" && focus === "wheel") {
      spin = Math.min(3.2, spin + 1.6);
      sound.tap("wood");
    }
    if (e.code === "KeyB" && focus === "wheel") spin = 0;
    if (e.code === "KeyR" && ["rack", "kiln"].includes(focus)) hold = "wait";
    if (e.code === "KeyC" && focus === "kiln" && state.kiln.phase === "firing")
      state.kiln.phase = "cooling";
    if (e.code === "Digit1" && focus === "supply") {
      form = "bowl";
      renderWork();
    }
    if (e.code === "Digit2" && focus === "supply") {
      form = "vase";
      renderWork();
    }
    if (e.code === "KeyZ" && (e.ctrlKey || e.metaKey) && p) {
      e.preventDefault();
      if (focus === "wheel" && shapeUndo.length)
        Object.assign(p, shapeUndo.pop());
      if (focus === "paint") {
        do {
          p.marks.pop();
        } while (p.marks.length && !p.marks[p.marks.length - 1].end);
      }
      dirty();
    }
  }
  if ([bind.forward, bind.back, bind.left, bind.right].includes(e.code))
    nav = [];
  if (e.code === bind.interact) interact();
  if (e.code === bind.drop) drop();
  if (e.code === bind.journal) openModal("journal");
  if (e.code === bind.map) openModal("map");
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "KeyR") hold = "";
});
window.addEventListener("blur", () => {
  controls?.endDrag();
  controlDrag = null;
  keys.clear();
  hold = "";
  dragging = false;
  rightDrag = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    hold = "";
    void persist();
  }
});
window.addEventListener("pagehide", () => void persist());
function updateUI() {
  const p = active(state),
    task = nextTask(p);
  $("#objective").textContent = task.text;
  $("#day").textContent =
    `第 ${state.day} 日 · ${p ? STAGES[p.stage] : "初入工坊"}`;
  $("#caption").textContent =
    state.settings.subtitles && focus
      ? STATIONS.find((s) => s.id === focus)!.subtitle
      : "";
  $("#control-hint").textContent = focus
    ? "Esc 起身 · F 托起坯板 · 工序与器物自动保存"
    : `${state.settings.bindings.forward.replace("Key", "")}${state.settings.bindings.left.replace("Key", "")}${state.settings.bindings.back.replace("Key", "")}${state.settings.bindings.right.replace("Key", "")} 行走 · 鼠标 看向 · ${state.settings.bindings.interact.replace("Key", "")} 操作 · ${state.settings.bindings.drop.replace("Key", "")} 放下${state.held ? " · 正在手持" + (state.held === p?.id ? "坯板" : "工具") : ""}`;
  if (!focus && !modal) {
    const n = nearest();
    $("#prompt").classList.toggle("hidden", n.d > 2.2);
    $("#prompt").innerHTML =
      `<kbd>${state.settings.bindings.interact.replace("Key", "")}</kbd>${state.held ? "放下并操作" : "走近 · 操作"} ${n.s.name}`;
  } else $("#prompt").classList.add("hidden");
  if (p && focus) {
    const set = (id: string, value: string) => {
      const el = $(id);
      if (el) el.textContent = value;
    };
    set(
      "#hand-status",
      focus === "clay"
        ? `练泥 ${Math.round(p.preparation * 100)}% · 含水 ${Math.round(p.moisture * 100)}%`
        : focus === "wheel"
          ? `轮速 ${Math.round(spin * 9.55)} 转/分 · 最薄器壁 ${(Math.min(...p.thickness) * 1000).toFixed(1)} mm${!p.opened ? ` · 开孔 ${Math.round(opening * 100)}%` : ""}${["leather", "trimmed"].includes(p.stage) ? ` · 利坯 ${Math.round(p.trimmed * 100)}%` : ""}`
          : focus === "glaze"
            ? `入釉 ${Math.round(depth * 100)}% · 釉层 ${glazeMean(p).toFixed(2)} · ${p.footClean ? "足已净" : "待擦足"}`
            : focus === "paint"
              ? `笔锋 ${(brushSize * 1000).toFixed(0)} · 青料 ${Math.round(ink * 100)}%`
              : "",
    );
    set(
      "#prep-status",
      p.stage === "prepared"
        ? "泥已练匀"
        : Math.round(p.preparation * 100) + "%",
    );
    const a = $("#prep-meter");
    if (a) a.style.width = p.preparation * 100 + "%";
    const b = $("#trim-meter");
    if (b) b.style.width = p.trimmed * 100 + "%";
    set("#glaze-thick", glazeMean(p).toFixed(2));
    const g = $("#glaze-meter");
    if (g) g.style.width = Math.min(100, (glazeMean(p) / 1.4) * 100) + "%";
    set("#thickness", (Math.min(...p.thickness) * 1000).toFixed(1) + " mm");
    set(
      "#dry-status",
      p.location === "rack"
        ? `含水 ${Math.round(p.moisture * 100)}% · ${STAGES[p.stage]}`
        : "",
    );
  }
  if (focus === "kiln") {
    const k = state.kiln;
    $("#kiln-temp").textContent =
      `${k.phase === "idle" ? "窑静" : k.phase === "cooling" ? "自然冷却" : "火起"} · ${Math.round(k.temperature)} ℃`;
    $("#kiln-fuel").textContent = Math.round(k.fuel * 100) + "%";
    $("#curve").setAttribute(
      "points",
      k.curve
        .map(
          ([t, temp]) =>
            `${(t / Math.max(40, k.elapsed)) * 260},${87 - (temp / 1450) * 85}`,
        )
        .join(" "),
    );
  }
}
function tick(ms: number) {
  const frameMs = lastTime ? ms - lastTime : 16.67;
  const dt = Math.min(0.05, frameMs / 1000);
  lastTime = ms;
  elapsed += dt;
  if (started) {
    if (!document.hidden && !paused) {
      const p = active(state);
      advance(state, dt, hold === "wait" ? 8 : 1);
      physics.setKilnHot(state.kiln.phase !== "idle");
      if (packing) {
        // Folding progress follows the player's paper drag, not an automatic timer.
        game.packProgress = clamp(packingTime / 2.8, 0, 1);
        if (packingTime >= 2.8) {
          const q = state.pieces.find((q) => q.id === packing);
          if (q) {
            q.stage = "packed";
            q.history.push("验看分等，包纸束草，收入成器堂。");
          }
          packing = null;
          dirty();
          if (focus) renderWork();
          toast("此器已入藏。你的指痕与笔意，都留在了这窑青花里。");
        }
      }
      spin *= Math.exp(-dt * (dragging ? 0.28 : 0.09));
      if (spin < 0.02) spin = 0;
      if (
        p &&
        focus === "wheel" &&
        dragging &&
        contactValid &&
        ["leather", "trimmed"].includes(p.stage) &&
        spin > 0.2
      ) {
        trim(p, dt * Math.min(1.5, spin), ring);
        hold = "trim-contact";
      }
      if (focus === "glaze" && depth > 0.01 && p?.location === "glaze") {
        dip(p, dt, depth);
        hold = "dip";
      }
      if (hold) {
        holdTimer += dt;
        if (p) {
          if (hold === "prepare") {
            prepare(p, dt * 1.5, water);
            game.workMotion = 0.3 + Math.sin(elapsed * 5) * 0.3;
          }
          if (hold === "trim") {
            trim(p, dt, ring);
            game.rotation += dt * 2;
            game.workMotion = ring / 47;
          }
          if (hold === "dip") {
            game.workMotion = 0.6;
          }
        }
        if (holdTimer > 0.22) {
          dirty();
          holdTimer = 0;
          sound.tap(["prepare", "knead"].includes(hold) ? "clay" : "brush");
        }
      }
      if (p) {
        const stage = p.id + p.stage;
        if (stage !== lastStage) {
          if (lastStage) {
            dirty();
            if (focus) renderWork();
          }
          lastStage = stage;
        }
      }
    }
    const canWalk = !focus && !modal && !paused && !document.hidden;
    let x = 0,
      z = 0;
    if (canWalk) {
      const b = state.settings.bindings;
      if (nav.length) {
        const t = nav[0],
          dx = t[0] - state.player[0],
          dz = t[2] - state.player[2],
          dist = Math.hypot(dx, dz);
        if (dist < 0.12) nav.shift();
        else {
          x = dx / dist;
          z = dz / dist;
          const desiredYaw = Math.atan2(-x, -z);
          const yawDelta = Math.atan2(
            Math.sin(desiredYaw - yaw),
            Math.cos(desiredYaw - yaw),
          );
          yaw += clamp(yawDelta, -dt * 2.4, dt * 2.4);
          pitch = -0.06;
        }
      } else {
        const forward = Number(keys.has(b.forward)) - Number(keys.has(b.back)),
          right = Number(keys.has(b.right)) - Number(keys.has(b.left));
        x = -Math.sin(yaw) * forward + Math.cos(yaw) * right;
        z = -Math.cos(yaw) * forward - Math.sin(yaw) * right;
        const l = Math.hypot(x, z);
        if (l) {
          x /= l;
          z /= l;
        }
      }
    }
    const travel = locomotion.plan(
      {
        x,
        z,
        yaw,
        run: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        crouch: keys.has("ControlLeft") || keys.has("ControlRight"),
        carrying: !!state.held,
        enabled: canWalk,
        bob: state.settings.bob,
      },
      dt,
    );
    const old = [...state.player];
    if (canWalk) state.player = physics.move(travel.x, travel.z, dt);
    const actual = { x: state.player[0] - old[0], z: state.player[2] - old[2] };
    const motion = locomotion.observe(actual, dt);
    const moving = motion.speed > 0.04;
    for (const contact of motion.steps)
      sound.step(contact.foot, contact.strength);
    if (canWalk && nav.length === 0 && moving) state.yaw = yaw;
    if (
      canWalk &&
      state.held &&
      keys.has("ShiftLeft") &&
      Math.hypot(travel.x, travel.z) > 0.004 &&
      Math.hypot(actual.x, actual.z) < 0.001 &&
      elapsed - lastCarriedBump > 0.8
    ) {
      const carried = active(state);
      if (carried?.stage === "thrown") {
        carried.stress += 0.02;
        lastCarriedBump = elapsed;
        toast("坯板撞到了障碍，请托稳慢行。");
      }
    }
    physics.syncProps(state.props, state.held);
    controls.update(elapsed);
    controls.setValue("kiln-draft", state.kiln.draft);
    controls.setValue("glaze-dip", depth);
    game.pose(dt, yaw, pitch, moving, elapsed, motion);
    game.rotation += spin * dt;
    game.action = packing ? "pack" : hold || (dragging ? "drag" : "");
    game.dipDepth = depth;
    sound.update(
      state.kiln.phase === "firing"
        ? state.kiln.fuel /
            (1 + Math.hypot(state.player[0] - 6, state.player[2] - 4) * 0.25)
        : 0,
      state.settings.volume,
      state.settings.sound,
    );
    uiTimer += dt;
    saveTimer += dt;
    if (uiTimer > 0.18) {
      updateUI();
      uiTimer = 0;
      game.sync();
    }
    if (saveTimer > 4) {
      void persist();
      saveTimer = 0;
    }
    if (!document.hidden) frames.push(frameMs);
    if (frames.length > 600) frames.shift();
  } else {
    game.camera.position.set(-2 + Math.sin(elapsed * 0.025) * 0.5, 1.85, 3.15);
    game.camera.lookAt(0.6, 1.15, -4.5);
  }
  game.update(dt, elapsed);
  requestAnimationFrame(tick);
}
async function boot() {
  try {
    try {
      const loaded = await restore();
      if (loaded) {
        state = loaded;
        // This revision introduces embodied gait. Migrate the old default once;
        // subsequent comfort-mode choices remain the player's preference.
        if (!localStorage.getItem("yaohuo-embodied-gait-v1")) {
          state.settings.bob = true;
          localStorage.setItem("yaohuo-embodied-gait-v1", "1");
        }
        $("#start").textContent = "回到工坊 →";
      }
    } catch {
      toast("旧存档无法读取，可在设置里导入备份。");
    }
    try {
      localStorage.setItem("yaohuo-embodied-gait-v1", "1");
    } catch {
      /* Storage may be unavailable. */
    }
    yaw = state.yaw;
    locomotion.reset(yaw);
    game = new Workshop($("#world"), state);
    physics = new Physics();
    await Promise.all([
      game.load((label) => ($("#loading").textContent = "正在准备 · " + label)),
      physics.init(state.player, state.props),
    ]);
    controls = new CraftControls(game.scene, game.craftAssets,game.controlSurfaces);
    game.applyLocalLighting(controls.group);
    applyLightingAudit(game.scene,new URLSearchParams(location.search).get('lighting-audit')||'');
    const canvas = game.renderer.domElement;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      if (!started || modal) return;
      if (e.button === 2) {
        rightDrag = true;
        if (focus !== "glaze") return;
      }
      if (!focus) {
        void lock();
        return;
      }
      if (focus && e.button === 0) {
        if (focus === "wheel" && !game.hitPiece(e.clientX, e.clientY)) {
          const wheel = game.hitWheel(e.clientX, e.clientY);
          if (wheel) {
            wheelGrabAngle = Math.atan2(wheel.point.x, wheel.point.z + 5.6);
            canvas.setPointerCapture(e.pointerId);
            return;
          }
        }
        const hit = controls.hit(
          game.camera,
          e.clientX,
          e.clientY,
          innerWidth,
          innerHeight,
        );
        if (hit && !game.hitPiece(e.clientX, e.clientY)) {
          useControl(hit);
          if (hit.gesture === "drag") {
            controlDrag = hit;
            controls.beginDrag(hit, game.camera);
          }
          canvas.setPointerCapture(e.pointerId);
          return;
        }
      }
      if (e.button === 0 || (e.button === 2 && focus === "glaze")) {
        const p = active(state),
          hit = game.hitPiece(e.clientX, e.clientY);
        if (hit && p?.location === focus) {
          dragging = true;
          contactValid = true;
          gestureTravel = 0;
          lastX = e.clientX;
          lastY = e.clientY;
          ring = Math.round((hit.uv?.y || 0.5) * 47);
          game.workMotion = ring / 47;
          if (focus === "wheel" && p.opened)
            shapeUndo.push({
              radius: [...p.radius],
              wheelTraces: structuredClone(p.wheelTraces||[]),
              thickness: [...p.thickness],
              height: p.height,
            });
          if (shapeUndo.length > 30) shapeUndo.shift();
          markAt(e.clientX, e.clientY, true);
          canvas.setPointerCapture(e.pointerId);
        }
      }
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (focus && !modal) {
          e.preventDefault();
          if (e.shiftKey && focus === "paint")
            brushSize = clamp(brushSize - e.deltaY * 0.00002, 0.005, 0.06);
          else if (focus === "wheel")
            spin = clamp(spin + e.deltaY * 0.004, 0, 3.2);
          else game.rotation += e.deltaY * 0.003;
        }
      },
      { passive: false },
    );
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      paused = true;
      void persist();
      $("#modal-root").innerHTML =
        '<div class="context-error"><h2>画面暂时中断</h2><p>工坊已尝试保存。浏览器恢复图形环境后会重新载入。</p><button onclick="location.reload()">重新打开工坊</button></div>';
    });
    canvas.addEventListener("webglcontextrestored", () => location.reload());
    $("#start").textContent = state.pieces.length
      ? "回到工坊 →"
      : "推门，入工坊 →";
    ($("#start") as HTMLButtonElement).disabled = false;
    $("#loading").textContent = "WASD 行走 · E 操作 · 按住右键可转动视角";
    $(".loading-line").classList.add("hidden");
    $("#start").addEventListener("click", () => {
      started = true;
      paused = false;
      $("#intro").classList.add("hidden");
      $("#hud").classList.remove("hidden");
      sound.start();
      updateUI();
      toast(
        state.pieces.length
          ? "工坊与你的作品，仍在这里。"
          : "先到左侧原料房取泥。也可打开「工坊图」引路。",
      );
      void persist();
    });
    // Read-only diagnostics: no stage changes or hidden gameplay completion hooks.
    Object.defineProperty(window, "__YAOHUO__", {
      value: {
        snapshot: () => structuredClone(state),
        hitPiece: (x: number, y: number) => {
          const hit = game.hitPiece(x, y);
          return hit
            ? {
                uv: hit.uv.toArray(),
                surface: hit.surface,
                point: hit.point.toArray(),
              }
            : null;
        },
        inspectSurface: (x:number,y:number) => {
          const ray=new THREE.Raycaster();
          ray.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),game.camera);
          const hit=ray.intersectObjects(game.scene.children,true).find(h=>h.object.visible&&h.object instanceof THREE.Mesh);
          if(!hit||!(hit.object instanceof THREE.Mesh))return null;
          const m=(Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material) as THREE.MeshStandardMaterial;
          const lm=m.lightMap,uv=hit.uv1,im=lm?.image as {data:Uint16Array|Float32Array;width:number;height:number}|undefined;
          let lightmapSample:number[]|undefined;
          if(im?.data&&uv){const x=Math.max(0,Math.min(im.width-1,Math.floor(uv.x*im.width))),y=Math.max(0,Math.min(im.height-1,Math.floor(uv.y*im.height))),i=(y*im.width+x)*4;
            lightmapSample=[0,1,2].map(c=>im.data instanceof Uint16Array?THREE.DataUtils.fromHalfFloat(im.data[i+c]):im.data[i+c]);}
          return {object:hit.object.name,parent:hit.object.parent?.name,point:hit.point.toArray(),
            normal:hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).toArray(),
            material:m.name,type:m.type,color:m.color?.toArray(),roughness:m.roughness,metalness:m.metalness,
            envMap:m.envMap?.uuid,envMapIntensity:m.envMapIntensity,lightMap:!!m.lightMap,aoMap:!!m.aoMap,
            shader:m.customProgramCacheKey().slice(0,180),uv:hit.uv?.toArray(),lightUV:uv?.toArray(),lightmapSample};
        },
        inspectMeshes: (name:string) => {
          const result:unknown[]=[];
          game.scene.updateMatrixWorld(true);
          game.scene.traverse(o=>{
            if(!(o instanceof THREE.Mesh)||!o.name.includes(name))return;
            o.geometry.computeBoundingBox();
            const bounds=o.geometry.boundingBox!;
            const m=(Array.isArray(o.material)?o.material[0]:o.material) as THREE.MeshStandardMaterial;
            const samples:number[][]=[];
            if(o instanceof THREE.InstancedMesh)for(let i=0;i<Math.min(o.count,4);i++){
              const matrix=new THREE.Matrix4();o.getMatrixAt(i,matrix);samples.push(matrix.toArray());
            }
            result.push({name:o.name,type:o.type,position:o.getWorldPosition(new THREE.Vector3()).toArray(),
              bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},vertices:o.geometry.attributes.position.count,
              instances:o instanceof THREE.InstancedMesh?o.count:1,samples,
              material:m.name,color:m.color?.toArray(),alphaTest:m.alphaTest,alphaMap:m.alphaMap?.image?.src,
              map:m.map?.image?.src,envMap:m.envMap?.uuid,shader:m.customProgramCacheKey().slice(0,200)});
          });return result;
        },
        stats: () => ({
          fps:
            1000 /
            (frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length)),
          ...game.getStats(),
        }),
        view: () => ({
          focus,
          modal,
          nav: nav.length,
          camera: game.camera.position.toArray(),
          cameraQuaternion: game.camera.quaternion.toArray(),
          cameraFov: game.camera.fov,
          look: { yaw, pitch },
          pieceBounds: game.activeBounds(),
          hands: game.handDiagnostics(),
        }),
      },
      writable: false,
    });
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Local server remains usable if browser policy disallows offline cache. */
      });
    requestAnimationFrame(tick);
  } catch (err) {
    $("#loading").textContent = "工坊加载失败：" + (err as Error).message;
    $("#start").textContent = "刷新重试";
    ($("#start") as HTMLButtonElement).disabled = false;
    $("#start").onclick = () => location.reload();
    console.error(err);
  }
}
void boot();
