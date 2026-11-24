/*
 * 홈 첫 화면 비교용 '잘 고쳐지는' 예시 PSD를 만들어요. (A1, 75ppi)
 *
 *   npm run sample:showcase   →  samples/sample-showcase.psd (+ .preview.png)
 *
 * 디자이너가 흔히 하는 실수를 담되, 고치면 디자인이 그대로 좋아 보이게 만들었어요 (멘토 피드백: 최고를 보여주는 예시).
 *   - 옅은 회색·흰 글자 (대비 부족) → 같은 색 계열에서 진하게
 *   - 작은 안내 글자 (2m에서 저시력자가 못 읽음) → 주변에 여백이 있어 겹치지 않고 커져요
 *   - 색만 다른 '매진'·'예매 가능' → 굵게 + 밑줄
 *   - 그림 위 글자가 없어서 어색한 배경 띠가 생기지 않아요
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

function drawArtwork(ctx) {
  // 아래는 흰 바탕, 위는 하늘색 → 연보라 파스텔 그라데이션 + 옅은 원 (글자 뒤는 비워 둬요)
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  const TOP = 1240;
  const g = ctx.createLinearGradient(0, 0, W, TOP);
  g.addColorStop(0, "#D9E9FF"); g.addColorStop(1, "#ECE4FF");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, TOP);
  const blobs = [[1420, 330, 260, "#FFD9C7"], [1250, 760, 330, "#CDEFE0"], [1600, 980, 190, "#FFFFFF"], [1050, 230, 120, "#FFFFFF"]];
  for (const [x, y, r, c] of blobs) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// runs: [{ text, color }] — 한 레이어 안에서 색만 다른 구간
const TEXTS = [
  { name: "제목", runs: [{ text: "빛의 정원", color: "#1D1D1F" }], bold: true, px: 250, x: 130, y: 660 },
  { name: "영문 부제", runs: [{ text: "GARDEN OF LIGHT", color: "#FFFFFF" }], bold: true, px: 56, x: 140, y: 790 },
  { name: "일시", runs: [{ text: "8.15(금) – 8.24(일)", color: "#A3A9B3" }], bold: true, px: 52, x: 140, y: 1560 },
  { name: "회차 안내", runs: [{ text: "주말 ", color: "#A3A9B3" }, { text: "매진", color: "#E5484D" }, { text: " · 평일 ", color: "#A3A9B3" }, { text: "예매 가능", color: "#30A46C" }], px: 42, x: 140, y: 1690 },
  { name: "장소", runs: [{ text: "서울식물원 2층 온실", color: "#A3A9B3" }], px: 42, x: 140, y: 1820 },
  { name: "가격", runs: [{ text: "성인 15,000원 · 어린이 무료", color: "#A3A9B3" }], px: 40, x: 140, y: 1950 },
  { name: "접근성 안내", runs: [{ text: "휠체어 · 음성 안내 제공", color: "#A3A9B3" }], px: 36, x: 140, y: 2080 },
  { name: "주최", runs: [{ text: "주최 ○○문화재단", color: "#B5BAC3" }], px: 26, x: 140, y: 2400 }
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
  fs.writeFileSync(path.join(out, "sample-showcase.psd"), buf);
  fs.writeFileSync(path.join(out, "sample-showcase.preview.png"), comp.toBuffer("image/png"));
  console.log(`sample-showcase.psd: ${W}x${H}px, ${PPI}ppi (A1), 텍스트 레이어 ${TEXTS.length}개, ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
}

main();
