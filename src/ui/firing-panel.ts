import {
  active,
  lightKiln,
  loadKiln,
  type GameState,
} from "../simulation/model";

export class FiringPanel {
  readonly element = document.createElement("section");
  private state: GameState | null = null;
  private power = 0;
  constructor(
    private changed: () => void,
    private notify: (s: string) => void,
  ) {
    this.element.id = "firing-panel";
    this.element.hidden = true;
    this.element.innerHTML = `<div class="firing-title"><span>烧制</span><strong id="fire-temperature">24 ℃</strong><span id="fire-stage"></span></div>
      <div class="firing-scale" role="meter" aria-label="窑内温度" aria-valuemin="24" aria-valuemax="1440"><div class="fire-zone" title="目标温区 1220–1300 ℃"></div><i id="fire-needle"></i></div>
      <div class="fire-ticks"><span>常温</span><span>600 ℃ · 升温</span><span>1220–1300 ℃ · 保温</span><span>过火</span></div>
      <div class="fire-controls"><button id="fire-start">装窑并开始烧制</button><button id="fire-down">按住降温</button><button id="fire-up">按住升温</button><button id="fire-finish">止火冷却</button></div>
      <div class="fire-status"><span id="fire-guidance">先准备清足并充分阴干的坯体</span><div class="heat-progress"><i id="fire-heat"></i></div></div>`;
    document.querySelector("#app")!.append(this.element);
    this.element.querySelector("#fire-start")!.addEventListener("click", () => {
      if (!this.state) return;
      try {
        const p = active(this.state);
        if (p?.stage === "dry") loadKiln(this.state, p);
        lightKiln(this.state);
        this.state.kiln.assisted = false;
        this.state.kiln.controlled = true;
        this.state.kiln.power = 0;
        this.changed();
      } catch (e) {
        this.notify((e as Error).message);
      }
    });
    for (const [id, power] of [
      ["fire-up", 1],
      ["fire-down", -1],
    ] as const) {
      const button = this.element.querySelector<HTMLButtonElement>("#" + id)!;
      button.addEventListener("pointerdown", (e) => {
        if (!this.state || this.state.kiln.phase !== "firing") return;
        button.setPointerCapture(e.pointerId);
        this.power = power;
        this.state.kiln.controlled = true;
        this.state.kiln.assisted = false;
        this.state.kiln.power = power;
        this.changed();
      });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        button.addEventListener(event, () => this.release());
    }
    this.element
      .querySelector("#fire-finish")!
      .addEventListener("click", () => {
        if (this.state?.kiln.phase === "firing") {
          this.state.kiln.phase = "cooling";
          this.release();
          this.changed();
        }
      });
    window.addEventListener("blur", () => this.release());
  }
  private release() {
    this.power = 0;
    if (this.state?.kiln.controlled) this.state.kiln.power = 0;
  }
  show(state: GameState | null) {
    this.release();
    this.state = state;
    this.element.hidden = !state;
    document.body.classList.toggle("firing-studio", !!state);
    if (state) this.update();
  }
  update() {
    if (!this.state) return;
    const k = this.state.kiln,
      p = active(this.state),
      progress = Math.min(1, (p?.heat || 0) / 11),
      phase = k.phase;
    this.element.querySelector("#fire-temperature")!.textContent =
      `${Math.round(k.temperature)} ℃`;
    this.element.querySelector("#fire-stage")!.textContent =
      phase === "firing"
        ? k.temperature < 1220
          ? "升温"
          : k.temperature > 1300
            ? "温度过高"
            : "目标温区"
        : phase === "cooling"
          ? "自然冷却"
          : p?.stage === "fired"
            ? "烧制完成"
            : "待装窑";
    (this.element.querySelector("#fire-needle") as HTMLElement).style.left =
      `${((k.temperature - 24) / 1416) * 100}%`;
    this.element
      .querySelector(".firing-scale")!
      .setAttribute("aria-valuenow", String(Math.round(k.temperature)));
    (this.element.querySelector("#fire-heat") as HTMLElement).style.width =
      `${progress * 100}%`;
    this.element.querySelector("#fire-guidance")!.textContent =
      phase === "cooling"
        ? "冷却至 65 ℃ 后可取出 · R 加快等候"
        : phase === "firing"
          ? `保温成熟度 ${Math.round(progress * 100)}% · ${progress >= 1 ? "可止火冷却" : this.power > 0 ? "正在升温" : this.power < 0 ? "正在降温" : "松开保持温度，进入目标区间累积热量"}`
          : p?.stage === "fired"
            ? `已出窑 · ${p.score} 分 · ${p.defects.length ? p.defects.join(" / ") : "釉净器正"}`
            : "按住升温进入目标区间，成熟后止火冷却";
    (this.element.querySelector("#fire-start") as HTMLButtonElement).disabled =
      phase !== "idle" || !p || !["dry", "loaded"].includes(p.stage);
    for (const id of ["fire-up", "fire-down", "fire-finish"])
      (this.element.querySelector("#" + id) as HTMLButtonElement).disabled =
        phase !== "firing";
  }
}
