/*
 * 색각이상·좁은 시야 시연용 샘플 PSD를 만들어요. (A1 현수막, 75ppi, 텍스트 레이어 6개)
 *
 *   npm run sample:color   →  samples/sample-color.psd (+ .preview.png)
 *
 * 일부러 넣은 문제:
 *   - 색만 다른 강조: "매진"(빨강)과 "예매 가능"(초록)이 크기·굵기는 같고 색만 달라요 → 적·녹색맹이면 같아 보여요 (WCAG 1.4.1)
 *   - 색각이상 대비: 검은 띠 위 빨간 글자는 보통 눈엔 잘 보이지만 적색맹이면 어두워져 안 보여요
 *   - 흩어진 정보: 일시는 왼쪽 위, 장소는 오른쪽 아래 → 벽 포스터(2m)를 시야가 좁은 사람이 보면 한눈에 안 들어와요
 * 기존 샘플(sample-poster*.psd)과 정답 파일은 건드리지 않아요.
 */
const fs = require("fs");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const agPsd = require("ag-psd");

const FONT_DIR = "C:/Windows/Fonts";
GlobalFonts.registerFromPath(path.join(FONT_DIR, "malgun.ttf"), "Malgun Gothic");
GlobalFonts.registerFromPath(path.join(FONT_DIR, "malgunbd.ttf"), "Malgun Gothic Bold");

const PPI = 75;
const W = Math.round((594 / 25.4) * PPI); // A1 가로 594mm
const H = Math.round((841 / 25.4) * PPI); // A1 세로 841mm
const BAND = { top: 1520, bottom: 1700 }; // 검은 띠

function drawArtwork(ctx) {
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  // 위쪽 장식: 밤하늘 느낌의 옅은 원들 (글자 뒤는 비워 둬요)
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 26; i++) {
    ctx.globalAlpha = 0.12 + rand() * 0.18;
    ctx.fillStyle = rand() > 0.5 ? "#8EC5FF" : "#FFD58E";
    ctx.beginPath();
    ctx.arc(900 + rand() * 850, 700 + rand() * 700, 30 + rand() * 120, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, BAND.top, W, BAND.bottom - BAND.top);
}

// runs: [{ text, color }] — 한 레이어 안에서 색만 다른 구간
const TEXTS = [
  { name: "제목", runs: [{ text: "여름밤 재즈 페스티벌", color: "#111111" }], bold: true, px: 120, x: 110, y: 260 },
  { name: "일시", runs: [{ text: "7.19(토) ", color: "#222222" }, { text: "매진", color: "#C62828" }, { text: " · 7.20(일) ", color: "#222222" }, { text: "예매 가능", color: "#2E7D32" }], px: 52, x: 110, y: 400 },
  { name: "가격", runs: [{ text: "입장료 30,000원 · 현장 구매 가능", color: "#222222" }], px: 44, x: 110, y: 1180 },
  { name: "우천 안내", runs: [{ text: "비가 오면 실내 공연장으로 옮겨요", color: "#FF2D1A" }], bold: true, px: 64, x: 110, y: 1638 },
  { name: "장소", runs: [{ text: "장소 · 한강 노들섬 야외무대", color: "#222222" }], bold: true, px: 52, x: 880, y: 2250 },
  { name: "주최", runs: [{ text: "주최 ○○시 · 문의 02-000-0000", color: "#555555" }], px: 30, x: 110, y: 2400 }
];

const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };

function renderText(t) {
  const font = `${t.px}px "${t.bold ? "Malgun Gothic Bold" : "Malgun Gothic"}"`;
  const probe = createCanvas(10, 10).getContext("2d");
  probe.font = font;
  const full = t.runs.map((r) => r.text).join("");
  const pad = Math.ceil(t.px * 0.5);
  const cw = Math.ceil(probe.measureText(full).width) + pad * 2, ch = Math.ceil(t.px * 1.6) + pad * 2;
  const c = createCanvas(cw, ch), ctx = c.getContext("2d");
  ctx.font = font; ctx.textBaseline = "alphabetic";
  const ox = pad, oy = pad + Math.ceil(t.px * 1.1);
  let x = ox;
  for (const r of t.runs) { ctx.fillStyle = r.color; ctx.fillText(r.text, x, oy); x += ctx.measureText(r.text).width; }
  const img = ctx.getImageData(0, 0, cw, ch);
  let minX = cw, minY = ch, maxX = -1, maxY = -1;
  for (let y = 0; y < ch; y++) for (let xx = 0; xx < cw; xx++) if (img.data[(y * cw + xx) * 4 + 3] > 0) {
    minX = Math.min(minX, xx); maxX = Math.max(maxX, xx); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const trimmed = ctx.getImageData(minX, minY, tw, th);
  const left = t.x + (minX - ox), top = t.y + (minY - oy);
  const canvas = createCanvas(tw, th); canvas.getContext("2d").putImageData(trimmed, 0, 0);
  return { imageData: { width: tw, height: th, data: new Uint8ClampedArray(trimmed.data) }, left, top, right: left + tw, bottom: top + th, canvas, text: full };
}

function main() {
  const out = path.join(__dirname, "..", "samples");
  const comp = createCanvas(W, H), cctx = comp.getContext("2d");
  drawArtwork(cctx);
  const bg = cctx.getImageData(0, 0, W, H);
  const children = [{ id: 1, name: "배경", left: 0, top: 0, right: W, bottom: H, imageData: { width: W, height: H, data: new Uint8ClampedArray(bg.data) } }];
  let id = 2;
  for (const t of TEXTS) {
    const r = renderText(t);
    cctx.drawImage(r.canvas, r.left, r.top);
    const psFont = t.bold ? "MalgunGothicBold" : "MalgunGothic";
    const style = (hex) => ({ font: { name: psFont }, fontSize: t.px, fillColor: hexToRgb(hex), fauxBold: false });
    children.push({
      id: id++, name: t.name, left: r.left, top: r.top, right: r.right, bottom: r.bottom, opacity: 1, imageData: r.imageData,
      text: {
        text: r.text,
        transform: [1, 0, 0, 1, t.x, t.y],
        style: style(t.runs[0].color),
        styleRuns: t.runs.length > 1 ? t.runs.map((x) => ({ length: x.text.length, style: style(x.color) })) : undefined
      }
    });
  }
  const compData = cctx.getImageData(0, 0, W, H);
  const psd = {
    colorMode: 3, width: W, height: H,
    imageResources: { resolutionInfo: { horizontalResolution: PPI, horizontalResolutionUnit: "PPI", widthUnit: "Centimeters", verticalResolution: PPI, verticalResolutionUnit: "PPI", heightUnit: "Centimeters" } },
    imageData: { width: W, height: H, data: new Uint8ClampedArray(compData.data) },
    children
  };
  const buf = agPsd.writePsdBuffer(psd, { invalidateTextLayers: true });
  fs.writeFileSync(path.join(out, "sample-color.psd"), buf);
  fs.writeFileSync(path.join(out, "sample-color.preview.png"), comp.toBuffer("image/png"));
  console.log(`sample-color.psd: ${W}x${H}px, ${PPI}ppi (A1), 텍스트 레이어 ${TEXTS.length}개, ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
}

main();
