export class Sound {
  context?: AudioContext;
  master?: GainNode;
  fire?: GainNode;
  enabled = true;
  volume = 0.35;
  private soleNoise?: AudioBuffer;
  private nextFoot: "left" | "right" = "left";
  start() {
    if (this.context) {
      void this.context.resume();
      return;
    }
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);
    // Cache unpitched noise once; each contact filters a different portion.
    this.soleNoise = this.context.createBuffer(
      1,
      this.context.sampleRate,
      this.context.sampleRate,
    );
    const sole = this.soleNoise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < sole.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + white * 0.075) / 1.075;
      sole[i] = brown * 2.5 + white * 0.2;
    }
    const b = this.context.createBuffer(
      1,
      this.context.sampleRate * 3,
      this.context.sampleRate,
    );
    const data = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
      data[i] = last * 2.5;
    }
    const n = this.context.createBufferSource();
    n.buffer = b;
    n.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 650;
    this.fire = this.context.createGain();
    this.fire.gain.value = 0.015;
    n.connect(filter).connect(this.fire).connect(this.master);
    n.start();
  }
  update(fire: number, volume: number, enabled: boolean) {
    this.enabled = enabled;
    this.volume = volume;
    if (this.master)
      this.master.gain.setTargetAtTime(
        enabled ? volume : 0,
        this.context!.currentTime,
        0.1,
      );
    if (this.fire)
      this.fire.gain.setTargetAtTime(
        0.015 + fire * 0.22,
        this.context!.currentTime,
        0.15,
      );
  }
  /** Cloth-soled foot on stone: a short heel load, then a softer sole scuff. */
  step(foot: "left" | "right", strength = 0.6) {
    if (!this.context || !this.master || !this.soleNoise || !this.enabled)
      return;
    const c = this.context;
    const now = c.currentTime;
    const weight = Math.max(0.15, Math.min(1, strength));
    const pan = c.createStereoPanner();
    pan.pan.value = foot === "left" ? -0.16 : 0.16;
    pan.connect(this.master);
    const impact = c.createBufferSource();
    impact.buffer = this.soleNoise;
    const low = c.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 180 + weight * 140 + Math.random() * 40;
    low.Q.value = 0.7;
    const heel = c.createGain();
    heel.gain.setValueAtTime(0.001, now);
    heel.gain.linearRampToValueAtTime(0.38 * weight, now + 0.007);
    heel.gain.exponentialRampToValueAtTime(0.001, now + 0.115);
    impact.connect(low).connect(heel).connect(pan);
    impact.start(now, Math.random() * 0.6, 0.14);
    impact.onended = () => {
      impact.disconnect();
      low.disconnect();
      heel.disconnect();
    };
    const scuff = c.createBufferSource();
    scuff.buffer = this.soleNoise;
    scuff.playbackRate.value = 0.9 + Math.random() * 0.2;
    const friction = c.createBiquadFilter();
    friction.type = "bandpass";
    friction.frequency.value = 750 + Math.random() * 650;
    friction.Q.value = 0.65;
    const sole = c.createGain();
    sole.gain.setValueAtTime(0.001, now + 0.018);
    sole.gain.linearRampToValueAtTime(0.11 * weight, now + 0.045);
    sole.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    scuff.connect(friction).connect(sole).connect(pan);
    scuff.start(now + 0.018, Math.random() * 0.55, 0.21);
    scuff.onended = () => {
      scuff.disconnect();
      friction.disconnect();
      sole.disconnect();
      pan.disconnect();
    };
  }
  tap(kind: "step" | "clay" | "wood" | "brush" = "wood") {
    if (kind === "step") {
      this.step(this.nextFoot);
      this.nextFoot = this.nextFoot === "left" ? "right" : "left";
      return;
    }
    if (!this.context || !this.enabled) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = kind === "clay" ? "sine" : "triangle";
    o.frequency.setValueAtTime(
      kind === "clay" ? 110 : kind === "brush" ? 1100 : 240,
      c.currentTime,
    );
    o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.1);
    g.gain.setValueAtTime(kind === "brush" ? 0.02 : 0.1, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.13);
    o.connect(g).connect(this.master!);
    o.start();
    o.stop(c.currentTime + 0.15);
  }
}
