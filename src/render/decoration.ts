import type { Decoration, PaintLayer } from "../simulation/decoration";

function motif(ctx: CanvasRenderingContext2D, kind: PaintLayer["kind"]) {
  ctx.lineWidth = 0.018;
  if (kind === "flower") {
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.beginPath();
      ctx.ellipse(0, -0.25, 0.1, 0.23, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    for (let row = 0; row < 3; row++) {
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const x = i / 80 - 0.5;
        ctx.lineTo(x, Math.sin(x * Math.PI * 4) * 0.1 + (row - 1) * 0.25);
      }
      ctx.stroke();
    }
  }
}
export function drawDecoration(
  ctx: CanvasRenderingContext2D,
  d: Decoration,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.fillStyle = d.baseColor;
  ctx.fillRect(0, 0, w, h);
  for (const l of d.layers) {
    ctx.fillStyle = ctx.strokeStyle = l.color;
    ctx.globalAlpha = l.opacity;
    if (l.kind === "stroke") {
      ctx.lineWidth = l.width * w;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.shadowColor = l.color;
      ctx.shadowBlur = Math.min(12, l.width * w * 0.24);
      for (const wrap of [-1, 0, 1]) {
        const points = l.points || [];
        if (!points.length) continue;
        ctx.beginPath();
        points.forEach(([u, v], i) => {
          const x = (u + wrap) * w,
            y = (1 - v) * h;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        if (points.length === 1) {
          ctx.arc(
            (points[0][0] + wrap) * w,
            (1 - points[0][1]) * h,
            ctx.lineWidth / 2,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        } else ctx.stroke();
      }
      ctx.shadowBlur = 0;
      continue;
    }
    if (l.kind === "band") {
      const y = (1 - l.v) * h,
        hh = l.height * h;
      ctx.fillRect(0, y - hh / 2, w, Math.max(1, hh * 0.035));
      ctx.fillRect(0, y + hh / 2, w, Math.max(1, hh * 0.035));
      const repeat = Math.max(3, Math.round(1 / l.width));
      for (let i = 0; i < repeat; i++) {
        ctx.save();
        ctx.translate(((i + 0.5) / repeat) * w, y);
        ctx.scale((w / repeat) * 0.85, hh * 0.8);
        motif(ctx, "wave");
        ctx.restore();
      }
      continue;
    }
    for (const wrap of [-1, 0, 1]) {
      ctx.save();
      ctx.translate((l.u + wrap) * w, (1 - l.v) * h);
      ctx.rotate(l.rotation);
      ctx.scale(l.width * w, l.height * h);
      if (l.kind === "text") {
        ctx.font = '0.82px "Noto Serif SC", "SimSun", serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(l.text || "福", 0, 0, 0.98);
      } else motif(ctx, l.kind);
      ctx.restore();
    }
  }
  ctx.restore();
}
