/*
 * 테스트용 공연 포스터 PSD를 만듭니다. (A3, 150ppi, 텍스트 레이어 7개)
 * 기획팀의 실제 PSD가 오기 전까지 B·C가 쓸 수 있는 데이터예요.
 * 일부러 문제가 있는 글자(작은 글자, 낮은 대비, 그림 위 글자)를 넣었어요.
 *
 *   node tools/make-sample-psd.js
 *   → samples/sample-poster.psd (RGB), samples/sample-poster-cmyk.psd (인쇄용 CMYK)
 *     와 각각의 .expected.json (정답 값)
 *
 * 주의: 포토샵에서 열면 글자가 포토샵 글꼴로 다시 그려질 수 있어요(맑은 고딕 기준).
 */
const fs = require("fs");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const agPsd = require("ag-psd");
const LD = require("../plugin/lib/layer-data.js");

const FONT_DIR = "C:/Windows/Fonts";
GlobalFonts.registerFromPath(path.join(FONT_DIR, "malgun.ttf"), "Malgun Gothic");
GlobalFonts.registerFromPath(path.join(FONT_DIR, "malgunbd.ttf"), "Malgun Gothic Bold");

const PPI = 150;
const W = Math.round((297 / 25.4) * PPI); // 1754
const H = Math.round((420 / 25.4) * PPI); // 2480
const BEIGE = "#F4EEE2";

// ---------- 배경 아트워크 ----------
function drawArtwork(ctx) {
  ctx.fillStyle = BEIGE;
  ctx.fillRect(0, 0, W, H);

  // 위쪽 절반: 짙은 남색 → 주황 그러데이션 + 거친 질감 (예술 영역)
  const g = ctx.createLinearGradient(0, 0, W, 1300);
  g.addColorStop(0, "#14213D");
  g.addColorStop(0.55, "#3A2E5C");
  g.addColorStop(1, "#E07A3F");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 1300);

  // 원과 선으로 복잡한 배경 만들기 (재현 가능하게 고정 난수)
  let seed = 42;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.08 + rand() * 0.25;
    ctx.fillStyle = rand() > 0.5 ? "#F6C177" : "#9A7BD1";
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * 1300, 20 + rand() * 180, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#FFE6C7";
  ctx.lineWidth = 3;
  for (let i = 0; i < 120; i++) {
    ctx.beginPath();
    ctx.moveTo(rand() * W, rand() * 1300);
    ctx.lineTo(rand() * W, rand() * 1300);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------- 텍스트 레이어 정의 ----------
// fontSize: 포토샵 내부 크기(px). scale: 변형 비율. 실제 크기 = fontSize × scale
const TEXTS = [
  { group: "타이틀", name: "제목", text: "봄의 제전", font: "Malgun Gothic Bold", psFont: "MalgunGothicBold", fontSize: 220, scale: 1, color: "#FFFFFF", x: 140, y: 560, purposeHint: "art" },
  { group: "타이틀", name: "영문 부제", text: "THE RITE OF SPRING", font: "Malgun Gothic", psFont: "MalgunGothic", fontSize: 54, scale: 1, color: "#E8A87C", x: 150, y: 680, purposeHint: "art" },
  { group: null, name: "그림 위 일정", text: "11월 8일 단 하루", font: "Malgun Gothic Bold", psFont: "MalgunGothicBold", fontSize: 64, scale: 1, color: "#C9763F", x: 150, y: 1180, purposeHint: "info" },
  { group: "공연 정보", name: "일시", text: "11.8(토) 19:30", font: "Malgun Gothic", psFont: "MalgunGothic", fontSize: 29, scale: 1, color: "#8A8478", x: 150, y: 1520, purposeHint: "info" },
  { group: "공연 정보", name: "장소", text: "예술의전당 오페라극장 3층", font: "Malgun Gothic Bold", psFont: "MalgunGothicBold", fontSize: 44, scale: 1, color: "#3B352C", x: 150, y: 1620, purposeHint: "info" },
  { group: "공연 정보", name: "가격", text: "R석 70,000원 · S석 50,000원 · 예매 필수", font: "Malgun Gothic", psFont: "MalgunGothic", fontSize: 36, scale: 1, color: "#6B6458", x: 150, y: 1720, purposeHint: "info" },
  { group: "공연 정보", name: "접근성 안내", text: "음성해설 · 수어통역 · 휠체어석 운영", font: "Malgun Gothic", psFont: "MalgunGothic", fontSize: 20, scale: 1.5, color: "#2F5D50", x: 150, y: 1820, purposeHint: "info" },
  { group: null, name: "주최·후원", text: "주최 ○○문화재단 · 후원 ○○구청", font: "Malgun Gothic", psFont: "MalgunGothic", fontSize: 18, scale: 1, color: "#B5AE9F", opacity: 0.8, x: 150, y: 2380, purposeHint: "other" }
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// 글자를 그린 뒤 투명한 테두리를 잘라 실제 잉크 영역만 남깁니다.
function renderText(t) {
  const px = t.fontSize * t.scale;
  const fontCss = `${px}px "${t.font}"`;
  const probe = createCanvas(10, 10).getContext("2d");
  probe.font = fontCss;
  const m = probe.measureText(t.text);
  const pad = Math.ceil(px * 0.5);
  const cw = Math.ceil(m.width) + pad * 2;
  const ch = Math.ceil(px * 1.6) + pad * 2;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext("2d");
  ctx.font = fontCss;
  ctx.fillStyle = t.color;
  ctx.textBaseline = "alphabetic";
  const originX = pad;
  const originY = pad + Math.ceil(px * 1.1);
  ctx.fillText(t.text, originX, originY);
  const img = ctx.getImageData(0, 0, cw, ch);

  let minX = cw, minY = ch, maxX = -1, maxY = -1;
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++)
      if (img.data[(y * cw + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const trimmed = ctx.getImageData(minX, minY, tw, th);
  // 문서 좌표: (t.x, t.y) 가 글자 기준점(베이스라인 왼쪽)
  const left = t.x + (minX - originX);
  const top = t.y + (minY - originY);
  return { imageData: { width: tw, height: th, data: new Uint8ClampedArray(trimmed.data) }, left, top, right: left + tw, bottom: top + th, canvas: (() => { const cc = createCanvas(tw, th); cc.getContext("2d").putImageData(trimmed, 0, 0); return cc; })() };
}

// CMYK 문서용: 디자이너가 % 단위로 고른 것처럼 반올림한 CMYK 값과, 그 값이 화면에 보이는 RGB
function toCmykColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const pct = LD.cmykPercent(LD.rgbToCmyk(r, g, b));
  const shown = LD.cmykToRgb(pct.c / 100, pct.m / 100, pct.y / 100, pct.k / 100);
  return { pct, hex: LD.toHex(shown.r, shown.g, shown.b) };
}

function build(mode, outDir) {
  const cmyk = mode === "cmyk";
  const base = cmyk ? "sample-poster-cmyk" : "sample-poster";

  const bg = createCanvas(W, H);
  const bctx = bg.getContext("2d");
  drawArtwork(bctx);
  const bgData = bctx.getImageData(0, 0, W, H);

  const comp = createCanvas(W, H);
  const cctx = comp.getContext("2d");
  cctx.drawImage(bg, 0, 0);

  let nextId = 2;
  const groups = {};
  const rootChildren = [
    { id: 1, name: "배경 아트워크", left: 0, top: 0, right: W, bottom: H, imageData: { width: W, height: H, data: new Uint8ClampedArray(bgData.data) } }
  ];
  const expected = [];

  for (const t0 of TEXTS) {
    const cc = cmyk ? toCmykColor(t0.color) : null;
    const t = cc ? Object.assign({}, t0, { color: cc.hex }) : t0;
    const fillColor = cc
      ? { c: (cc.pct.c / 100) * 255, m: (cc.pct.m / 100) * 255, y: (cc.pct.y / 100) * 255, k: (cc.pct.k / 100) * 255 }
      : hexToRgb(t.color);
    const r = renderText(t);
    cctx.globalAlpha = t.opacity == null ? 1 : t.opacity;
    cctx.drawImage(r.canvas, r.left, r.top);
    cctx.globalAlpha = 1;

    const id = nextId++;
    const layer = {
      id,
      name: t.name,
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      opacity: t.opacity == null ? 1 : t.opacity,
      imageData: r.imageData,
      text: {
        text: t.text,
        transform: [t.scale, 0, 0, t.scale, t.x, t.y],
        style: { font: { name: t.psFont }, fontSize: t.fontSize, fillColor, fauxBold: false }
      }
    };

    if (t.group) {
      if (!groups[t.group]) {
        groups[t.group] = { id: nextId++, name: t.group, opened: true, children: [] };
        rootChildren.push(groups[t.group]);
      }
      groups[t.group].children.push(layer);
    } else {
      rootChildren.push(layer);
    }

    const effPx = t.fontSize * t.scale;
    expected.push({
      id,
      name: t.name,
      text: t.text,
      groupPath: t.group ? [t.group] : [],
      color: t.color,
      cmyk: cc ? cc.pct : undefined,
      sizePx: effPx,
      sizePt: Math.round(((effPx * 72) / PPI) * 10) / 10,
      opacity: t.opacity == null ? 1 : t.opacity,
      bounds: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      purposeHint: t.purposeHint
    });
  }

  const compData = cctx.getImageData(0, 0, W, H);
  const psd = {
    colorMode: cmyk ? 4 : 3,
    width: W,
    height: H,
    imageResources: {
      resolutionInfo: {
        horizontalResolution: PPI,
        horizontalResolutionUnit: "PPI",
        widthUnit: "Centimeters",
        verticalResolution: PPI,
        verticalResolutionUnit: "PPI",
        heightUnit: "Centimeters"
      }
    },
    imageData: { width: W, height: H, data: new Uint8ClampedArray(compData.data) },
    children: rootChildren
  };

  const buf = agPsd.writePsdBuffer(psd, { invalidateTextLayers: true });
  fs.writeFileSync(path.join(outDir, base + ".psd"), buf);
  if (!cmyk) fs.writeFileSync(path.join(outDir, base + ".preview.png"), comp.toBuffer("image/png"));
  fs.writeFileSync(
    path.join(outDir, base + ".expected.json"),
    JSON.stringify({ colorMode: cmyk ? "CMYK" : "RGB", widthPx: W, heightPx: H, ppi: PPI, layers: expected }, null, 2)
  );
  console.log(`${base}.psd: ${W}x${H}px, ${PPI}ppi, ${cmyk ? "CMYK" : "RGB"}, 텍스트 레이어 ${expected.length}개, ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
}

function main() {
  const outDir = path.join(__dirname, "..", "samples");
  fs.mkdirSync(outDir, { recursive: true });
  build("rgb", outDir);
  build("cmyk", outDir);
}

main();
