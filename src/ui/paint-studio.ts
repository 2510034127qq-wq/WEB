import type { Piece } from "../simulation/model";
import type { Decoration, PaintLayer } from "../simulation/decoration";
import { drawDecoration } from "../render/decoration";

const palette = [
  "#173f78",
  "#315ea0",
  "#c4a552",
  "#e5d8b4",
  "#6f242c",
  "#2f695e",
  "#252727",
  "#edf0e5",
];
export class PaintStudio {
  readonly element = document.createElement("section");
  private canvas: HTMLCanvasElement;
  private piece: Piece | null = null;
  private tool = "stroke";
  private color = palette[0];
  private selected: string | null = null;
  private drag: {
    layer: PaintLayer;
    u: number;
    v: number;
    startU: number;
    startV: number;
  } | null = null;
  private history: Decoration[] = [];
  private signature = "";
  constructor(
    private change: () => void,
    private rotate: (delta: number) => void,
    private source: () => HTMLCanvasElement | undefined,
  ) {
    this.element.id = "paint-studio";
    this.element.hidden = true;
    this.element.innerHTML = `<header><span>绘饰 · 彩绘</span><small>展开画布 ↔ 烧成色预览</small></header>
      <div class="paint-tools" role="toolbar" aria-label="彩绘工具">
      ${[
        ["select", "选择"],
        ["stroke", "画笔"],
        ["fill", "底色"],
        ["band", "环带"],
        ["flower", "团花"],
        ["wave", "水纹"],
        ["text", "文字"],
      ]
        .map(
          ([id, name]) =>
            `<button type="button" data-paint-tool="${id}" aria-pressed="${id === "stroke"}">${name}</button>`,
        )
        .join("")}</div>
      <canvas id="paint-map" width="1024" height="1024" aria-label="器物外壁展开画布"></canvas>
      <div class="paint-swatches">${palette.map((c) => `<button type="button" data-paint-color="${c}" aria-label="颜色 ${c}" style="--swatch:${c}"></button>`).join("")}<input id="paint-color" type="color" value="${this.color}" aria-label="自定义颜色"></div>
      <div class="paint-row"><label>笔宽 <input id="map-brush-size" type="range" min="2" max="80" value="18"></label><input id="paint-text" maxlength="24" value="福" aria-label="纹样文字"></div>
      <div class="paint-tools"><button data-paint-action="smaller" aria-label="缩小图层">缩小</button><button data-paint-action="larger" aria-label="放大图层">放大</button><button data-paint-action="rotate">旋转</button><button data-paint-action="copy">复制</button><button data-paint-action="delete">删除</button><button data-paint-action="undo">撤回</button></div>
      <footer>拖动绘画或移动纹样 · 选择后可缩放、旋转、改色 · 滚轮旋看器物</footer>`;
    document.querySelector("#app")!.append(this.element);
    this.canvas = this.element.querySelector("canvas")!;
    this.element.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b || !this.piece) return;
      if (b.dataset.paintTool) {
        this.tool = b.dataset.paintTool;
        if (this.tool !== "select") this.selected = null;
        this.signature = "";
        this.element
          .querySelectorAll("[data-paint-tool]")
          .forEach((el) =>
            el.setAttribute(
              "aria-pressed",
              String((el as HTMLElement).dataset.paintTool === this.tool),
            ),
          );
      }
      if (b.dataset.paintColor) this.setColor(b.dataset.paintColor);
      if (b.dataset.paintAction) this.action(b.dataset.paintAction);
    });
    this.element
      .querySelector("#paint-color")!
      .addEventListener("input", (e) =>
        this.setColor((e.target as HTMLInputElement).value),
      );
    this.canvas.addEventListener("pointerdown", (e) => this.down(e));
    this.canvas.addEventListener("pointermove", (e) => this.move(e));
    this.canvas.addEventListener("pointerup", () => {
      this.drag = null;
    });
    this.canvas.addEventListener("pointercancel", () => {
      this.drag = null;
    });
    window.addEventListener("blur", () => {
      this.drag = null;
    });
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.rotate(e.deltaY * 0.004);
      },
      { passive: false },
    );
    this.element.addEventListener("keydown", (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "z" &&
        !(e.target as HTMLElement).matches("input")
      ) {
        e.preventDefault();
        e.stopPropagation();
        this.action("undo");
      }
    });
  }
  show(piece: Piece | null) {
    if (this.piece?.id !== piece?.id) {
      this.history = [];
      this.selected = null;
      this.drag = null;
      this.signature = "";
    }
    this.piece = piece;
    this.element.hidden = !piece;
    document.body.classList.toggle("painting-studio", !!piece);
    if (piece) this.signature = "";
  }
  private get decoration(): Decoration {
    return (this.piece!.decoration ??= { baseColor: "#edf0e5", layers: [] });
  }
  private checkpoint() {
    this.history.push(structuredClone(this.decoration));
    if (this.history.length > 25) this.history.shift();
  }
  undo() {
    this.action("undo");
  }
  private changed() {
    this.piece!.stage = "painted";
    this.change();
    this.signature = "";
  }
  private setColor(c: string) {
    this.color = c;
    (this.element.querySelector("#paint-color") as HTMLInputElement).value = c;
    const l = this.decoration.layers.find((l) => l.id === this.selected);
    if (l) {
      this.checkpoint();
      l.color = c;
      this.changed();
    }
    if (this.tool === "fill") {
      this.checkpoint();
      this.decoration.baseColor = c;
      this.changed();
    }
  }
  private point(e: PointerEvent) {
    const b = this.canvas.getBoundingClientRect();
    return {
      u: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      v: Math.max(0, Math.min(1, 1 - (e.clientY - b.top) / b.height)),
    };
  }
  private down(e: PointerEvent) {
    if (!this.piece || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.canvas.setPointerCapture(e.pointerId);
    const { u, v } = this.point(e),
      d = this.decoration;
    if (this.tool === "fill") {
      this.checkpoint();
      d.baseColor = this.color;
      this.changed();
      return;
    }
    if (this.tool === "select") {
      const l = [...d.layers]
        .reverse()
        .find(
          (l) =>
            l.kind !== "stroke" &&
            Math.abs(v - l.v) < l.height * 0.6 &&
            (l.kind === "band" || Math.abs(u - l.u) < l.width * 0.6),
        );
      this.selected = l?.id || null;
      if (l) {
        this.checkpoint();
        this.drag = { layer: l, u, v, startU: l.u, startV: l.v };
      }
      this.signature = "";
      return;
    }
    if (d.layers.length >= 160) return;
    this.checkpoint();
    const l: PaintLayer = {
      id: crypto.randomUUID(),
      kind: this.tool as PaintLayer["kind"],
      u,
      v,
      width: 0.17,
      height: 0.17,
      rotation: 0,
      color: this.color,
      opacity: 1,
    };
    if (l.kind === "stroke") {
      l.width =
        Number(
          (this.element.querySelector("#map-brush-size") as HTMLInputElement)
            .value,
        ) / 1024;
      l.points = [[u, v]];
    }
    if (l.kind === "band") {
      l.width = 0.09;
      l.height = 0.12;
    }
    if (l.kind === "text")
      l.text =
        (this.element.querySelector("#paint-text") as HTMLInputElement).value ||
        "福";
    d.layers.push(l);
    this.selected = l.id;
    this.drag = { layer: l, u, v, startU: u, startV: v };
    this.changed();
  }
  private move(e: PointerEvent) {
    if (!this.drag) return;
    e.preventDefault();
    e.stopPropagation();
    const { u, v } = this.point(e),
      { layer: l } = this.drag;
    if (l.kind === "stroke") {
      const pts = l.points!,
        last = pts[pts.length - 1];
      if (pts.length < 4000 && Math.hypot(u - last[0], v - last[1]) > 0.0008)
        pts.push([u, v]);
    } else {
      l.u = Math.max(0, Math.min(1, this.drag.startU + u - this.drag.u));
      l.v = Math.max(0, Math.min(1, this.drag.startV + v - this.drag.v));
    }
    this.changed();
  }
  private action(action: string) {
    if (!this.piece) return;
    if (action === "undo") {
      const d = this.history.pop();
      if (d) {
        this.piece.decoration = d;
        this.selected = null;
        this.changed();
      }
      return;
    }
    const d = this.decoration,
      l = d.layers.find((l) => l.id === this.selected);
    if (!l) return;
    this.checkpoint();
    if (action === "delete") {
      d.layers = d.layers.filter((q) => q !== l);
      this.selected = null;
    }
    if (action === "copy" && d.layers.length < 160) {
      const copy = structuredClone(l);
      copy.id = crypto.randomUUID();
      if (copy.kind === "band")
        copy.v = copy.v > 0.8 ? copy.v - 0.14 : copy.v + 0.14;
      else copy.u = (copy.u + 0.2) % 1;
      d.layers.push(copy);
      this.selected = copy.id;
    }
    if (action === "rotate")
      l.rotation = (l.rotation + Math.PI / 12) % (Math.PI * 2);
    if (action === "larger" || action === "smaller") {
      const factor = action === "larger" ? 1.15 : 1 / 1.15;
      l.width = Math.max(0.002, Math.min(1.5, l.width * factor));
      l.height = Math.max(0.002, Math.min(1.5, l.height * factor));
    }
    this.changed();
  }
  render() {
    if (!this.piece) return;
    const d = this.piece.decoration || { baseColor: "#edf0e5", layers: [] },
      sig = JSON.stringify(d) + this.selected + this.piece.marks.length;
    if (sig === this.signature) return;
    this.signature = sig;
    const ctx = this.canvas.getContext("2d")!,
      source = this.source();
    if (source) ctx.drawImage(source, 0, 0, 1024, 1024, 0, 0, 1024, 1024);
    else drawDecoration(ctx, d, 1024, 1024);
    const l = d.layers.find((l) => l.id === this.selected);
    this.element
      .querySelectorAll<HTMLButtonElement>("[data-paint-action]")
      .forEach((button) => {
        const action = button.dataset.paintAction!;
        button.disabled =
          action === "undo"
            ? !this.history.length
            : !l ||
              (l.kind === "stroke" && action !== "delete") ||
              (l.kind === "band" && action === "rotate");
        button.title =
          button.disabled && l?.kind === "stroke" && action !== "undo"
            ? "笔迹可改色、删除或撤回；纹样支持移动与变换"
            : button.disabled && l?.kind === "band" && action === "rotate"
              ? "环带沿器物一周排列，可上下移动或缩放"
              : "";
      });
    if (l && l.kind !== "stroke") {
      ctx.save();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 6]);
      ctx.translate(l.kind === "band" ? 512 : l.u * 1024, (1 - l.v) * 1024);
      ctx.rotate(l.rotation);
      const width = l.kind === "band" ? 1024 : l.width * 1024;
      ctx.strokeRect(-width / 2, -l.height * 512, width, l.height * 1024);
      ctx.restore();
    }
  }
}
