/*
 * 대표 샘플 '한밤의 레코드' PSD를 만들어요. (60×75cm 벽 포스터, 75ppi, 4:5)
 *
 *   npm run sample:record   →  samples/sample-record.psd (+ .preview.png)
 *
 * 홈 비교 그림과 '샘플로 해보기'에 쓰는 대표 예시예요. 실제 디자이너 포스터처럼 보이되,
 * 저시력자에게 흔한 실수를 담았고, 자동으로 고치면 디자인이 그대로 깔끔하게 좋아지게 만들었어요.
 *   - 가늘고(Light) 어두운 회색 안내 글자 → 대비 부족 + 2m에서 너무 작아요
 *   - 분홍 이름표(일시·장소…)도 작고 대비가 조금 모자라요
 *   - '매진'(빨강)·'예매 가능'(초록)이 색만 달라요 → 색각이상이면 구분이 안 돼요
 *   - 줄 사이·오른쪽에 여백이 있어서 겹치지 않고 커질 수 있어요. 그림 위 글자가 없어 배경 띠도 생기지 않아요
 *   - 핵심 정보(일시·장소·회차·티켓·접근성)는 한곳에 모여 있어요 (좁은 시야에도 한눈에 — 잘한 점)
 * 글꼴은 Windows의 Noto Sans KR(가변 굵기)로 그려요.
 */
const fs = require("fs");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const agPsd = require("ag-psd");

const FONT_DIR = "C:/Windows/Fonts";
GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansKR-VF.ttf"), "Noto Sans KR");

const PPI = 75;
const W = Math.round((600 / 25.4) * PPI); // 60cm
const H = Math.round((750 / 25.4) * PPI); // 75cm
const BG = "#0F1424";
const DISC = { x: 1378, y: 639, r: 546, label: 193, hole: 16 };

function drawArtwork(ctx) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  // 오른쪽 위 보랏빛, 오른쪽 가운데 청록빛 번짐
  const glow = (x, y, r, rgb, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W, 0, 760, "150,50,120", 0.55);
  glow(W + 60, 1150, 620, "40,120,150", 0.5);
  // 레코드판: 검은 원 + 가는 홈 + 분홍→주황 라벨
  ctx.fillStyle = "#0A0A0D";
  ctx.beginPath(); ctx.arc(DISC.x, DISC.y, DISC.r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.2;
  for (let r = DISC.label + 24; r < DISC.r - 8; r += 7) {
    ctx.strokeStyle = `rgba(255,255,255,${0.025 + ((r * 37) % 11) / 400})`;
    ctx.beginPath(); ctx.arc(DISC.x, DISC.y, r, 0, Math.PI * 2); ctx.stroke();
  }
  const lg = ctx.createLinearGradient(DISC.x - DISC.label, DISC.y - DISC.label, DISC.x + DISC.label, DISC.y + DISC.label);
  lg.addColorStop(0, "#FF5C93"); lg.addColorStop(1, "#FF9B66");
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(DISC.x, DISC.y, DISC.label, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = BG;
  ctx.beginPath(); ctx.arc(DISC.x, DISC.y, DISC.hole, 0, Math.PI * 2); ctx.fill();
  // 정보 위 가는 선
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(118, 1208, 1544, 2);
}

// 글자 레이어: lines(여러 줄), runs(한 줄 안에서 색만 다른 구간), weight(가변 굵기), tracking(1/1000em)
const FONTS = { 300: "NotoSansKR-Light", 400: "NotoSansKR-Regular", 700: "NotoSansKR-Bold", 900: "NotoSansKR-Black" };
const LABEL = "#E2477A", VALUE = "#646A7A";
const row = (name, label, y, value) => [
  { name: name + " 이름표", lines: [[{ text: label, color: LABEL }]], weight: 700, px: 32, x: 118, y },
  Object.assign({ name, weight: 300, px: 47, x: 330, y }, value)
];
const TEXTS = [
  { name: "호수", lines: [[{ text: "VOL.03  WINTER 2026", color: "#B9BDC9" }]], weight: 400, px: 36, x: 118, y: 180, tracking: 200 },
  { name: "제목", lines: [[{ text: "한밤의", color: "#F4EEE2" }], [{ text: "레코드", color: "#F4EEE2" }]], weight: 900, px: 250, leading: 262, x: 108, y: 609 },
  { name: "영문 부제", lines: [[{ text: "A NIGHT OF RECORDS AND QUIET SOUNDS", color: "#9AA0AE" }]], weight: 400, px: 32, x: 118, y: 988, tracking: 120 },
  ...row("일시", "일시", 1342, { lines: [[{ text: "12.20 토 — 12.21 일 · 오후 6시", color: VALUE }]] }),
  ...row("장소", "장소", 1507, { lines: [[{ text: "성수 레코드홀 지하 1층", color: VALUE }]] }),
  ...row("회차", "회차", 1672, { lines: [[{ text: "20일 ", color: VALUE }, { text: "매진", color: "#E0533D" }, { text: " · 21일 ", color: VALUE }, { text: "예매 가능", color: "#35A56A" }]] }),
  ...row("티켓", "티켓", 1833, { lines: [[{ text: "1일권 35,000원 · 2일권 60,000원", color: VALUE }], [{ text: "예매 ○○티켓 (12.1 오후 2시 오픈)", color: VALUE }]], leading: 56 }),
  ...row("접근성 안내", "접근성", 2040, { lines: [[{ text: "휠체어석 · 문자통역 · 진동 스피커", color: VALUE }]] }),
  { name: "주최", lines: [[{ text: "주최 ○○문화재단   후원 ○○구", color: "#6B7080" }]], weight: 400, px: 23, x: 118, y: 2157 }
];

const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };

function renderText(t) {
  const font = `${t.weight} ${t.px}px "Noto Sans KR"`;
  const track = ((t.tracking || 0) / 1000) * t.px;
  const leading = t.leading || Math.round(t.px * 1.2);
  const probe = createCanvas(10, 10).getContext("2d");
  probe.font = font;
  const widthOf = (s) => [...s].reduce((w, ch) => w + probe.measureText(ch).width + track, 0);
  const lineW = t.lines.map((runs) => runs.reduce((w, r) => w + (track ? widthOf(r.text) : probe.measureText(r.text).width), 0));
  const pad = Math.ceil(t.px * 0.5);
  const cw = Math.ceil(Math.max(...lineW)) + pad * 2, ch = Math.ceil(t.px * 1.4 + leading * (t.lines.length - 1)) + pad * 2;
  const c = createCanvas(cw, ch), ctx = c.getContext("2d");
  ctx.font = font; ctx.textBaseline = "alphabetic";
  const ox = pad, oy = pad + Math.ceil(t.px * 1.1);
  t.lines.forEach((runs, li) => {
    let x = ox;
    for (const r of runs) {
      ctx.fillStyle = r.color;
      if (track) for (const chh of r.text) { ctx.fillText(chh, x, oy + li * leading); x += ctx.measureText(chh).width + track; }
      else { ctx.fillText(r.text, x, oy + li * leading); x += ctx.measureText(r.text).width; }
    }
  });
  const img = ctx.getImageData(0, 0, cw, ch);
  let minX = cw, minY = ch, maxX = -1, maxY = -1;
  for (let y = 0; y < ch; y++) for (let xx = 0; xx < cw; xx++) if (img.data[(y * cw + xx) * 4 + 3] > 0) {
    minX = Math.min(minX, xx); maxX = Math.max(maxX, xx); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const trimmed = ctx.getImageData(minX, minY, tw, th);
  const left = t.x + (minX - ox), top = t.y + (minY - oy);
  const canvas = createCanvas(tw, th); canvas.getContext("2d").putImageData(trimmed, 0, 0);
  const text = t.lines.map((runs) => runs.map((r) => r.text).join("")).join("\r");
  return { imageData: { width: tw, height: th, data: new Uint8ClampedArray(trimmed.data) }, left, top, right: left + tw, bottom: top + th, canvas, text };
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
    const style = (hex) => {
      const s = { font: { name: FONTS[t.weight] }, fontSize: t.px, fillColor: hexToRgb(hex), fauxBold: false };
      if (t.tracking) s.tracking = t.tracking;
      if (t.leading) { s.leading = t.leading; s.autoLeading = false; }
      return s;
    };
    // 색 구간: 줄을 이은 글 기준 (줄바꿈 \r 도 한 글자)
    const runs = [];
    t.lines.forEach((line, li) => {
      line.forEach((x, k) => runs.push({ length: x.text.length + (li < t.lines.length - 1 && k === line.length - 1 ? 1 : 0), style: style(x.color) }));
    });
    const multiColor = new Set(runs.map((x) => JSON.stringify(x.style.fillColor))).size > 1;
    children.push({
      id: id++, name: t.name, left: r.left, top: r.top, right: r.right, bottom: r.bottom, opacity: 1, imageData: r.imageData,
      text: {
        text: r.text,
        transform: [1, 0, 0, 1, t.x, t.y],
        style: style(t.lines[0][0].color),
        styleRuns: multiColor ? runs : undefined
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
  fs.writeFileSync(path.join(out, "sample-record.psd"), buf);
  fs.writeFileSync(path.join(out, "sample-record.preview.png"), comp.toBuffer("image/png"));
  console.log(`sample-record.psd: ${W}x${H}px, ${PPI}ppi (60×75cm), 텍스트 레이어 ${TEXTS.length}개, ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
}

main();
