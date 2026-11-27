/*
 * '샘플 포스터로 해보기'에 쓰는 시연용 PSD를 만들어요. (SNS 세로 이미지 1080×1350)
 *
 *   npm run sample:demo   →  samples/sample-demo.psd (+ .preview.png)
 *
 * 고친 전후 차이가 한눈에 드러나도록, 2030 공연 포스터에서 흔한 실수를 한 장에 모았어요.
 * 고치는 방법은 모두 엔진 기준(engine/policies.js)이 정해요. 이 파일은 문제만 만들어요.
 *   - 어두운 바탕에 어두운 회색 글자 (대비 1.6~2.3:1) → 같은 색 계열에서 밝게
 *   - 작고 얇은 정보 글자 (Semilight) → 겹치지 않는 만큼 키우고 굵게. 아래에 여백을 넉넉히 둬요
 *   - 자간을 바짝 좁힌 장소 (-120) → 기본 간격
 *   - 줄 간격이 붙은 두 줄 가격 (1.0배) → 1.5배
 *   - 색만 다른 '매진'·'예매 가능' → 굵게 + 밑줄 / 굵게
 *   - 네온 빛 위 보라색 일시 (대비 부족) → 같은 보라 계열에서 밝게
 *   - 영문 전부 대문자 긴 문장 → 대소문자 섞기
 *   제목은 문제가 없게 둬서, 디자인은 그대로이고 정보만 또렷해지는 모습을 보여줘요.
 *
 * 글꼴: Windows 맑은 고딕을 먼저 찾고, 없으면 Mac Apple SD 산돌고딕 Neo, Linux Noto Sans CJK로 그려요.
 *   PSD 안 글꼴 이름은 어느 쪽이든 맑은 고딕이에요 (다른 샘플과 같게).
 */
const fs = require("fs");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");

const W = 1080;
const H = 1350;
const PPI = 72; // SNS 이미지라 인쇄 해상도는 의미가 없어요 (SNS는 화면 너비 기준으로 재요)

// ---------- 글꼴 ----------
const FONT_CANDIDATES = {
  regular: ["C:/Windows/Fonts/malgun.ttf", "/System/Library/Fonts/AppleSDGothicNeo.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"],
  bold: ["C:/Windows/Fonts/malgunbd.ttf", "/System/Library/Fonts/AppleSDGothicNeo.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"],
  light: ["C:/Windows/Fonts/malgunsl.ttf", "/System/Library/Fonts/AppleSDGothicNeo.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Light.ttc"]
};
const CSS = { regular: "Demo Regular", bold: "Demo Bold", light: "Demo Light" };
const PS_FONT = { regular: "MalgunGothic", bold: "MalgunGothicBold", light: "MalgunGothic-Semilight" };
for (const w of Object.keys(FONT_CANDIDATES)) {
  const file = FONT_CANDIDATES[w].find((f) => fs.existsSync(f));
  if (!file) throw new Error("한글 글꼴을 찾지 못했어요: " + FONT_CANDIDATES[w].join(", "));
  GlobalFonts.registerFromPath(file, CSS[w]);
}

// ---------- 배경 아트워크 ----------
const NAVY = "#121A2E";
function drawArtwork(ctx) {
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  // 위쪽: 네온 빛 번짐 (자홍·청록) + 가는 선. 일시 글자가 이 위에 놓여요
  const glow = (x, y, r, c) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c); g.addColorStop(1, "rgba(18,26,46,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  glow(940, 90, 380, "rgba(255,64,170,0.85)");
  glow(250, 420, 300, "rgba(40,210,230,0.70)");
  glow(960, 470, 200, "rgba(140,90,255,0.75)");
  // 작은 별빛 점 (글자 뒤를 복잡하게 만들지 않을 만큼만)
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 90; i++) {
    const x = rand() * W, y = rand() * 760, r = 1 + rand() * 2.2;
    if (y > 150 && y < 360 && x < 1010) continue; // 제목·부제 뒤는 비워요
    if (y > 580 && y < 700) continue; // 일시 뒤도
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- 텍스트 레이어 ----------
// px: 글자 크기 · weight: regular | bold | light · tracking: 포토샵 자간(1/1000 em) · leading: 줄 간격(px, 여러 줄일 때)
// runs: [{ text, color }] — 한 레이어 안에서 색만 다른 구간. lines: 여러 줄 (줄마다 runs)
const MUTED = "#4A5068"; // 어두운 바탕 위 어두운 회색 (대비 약 2.1:1)
const TEXTS = [
  { name: "제목", lines: [[{ text: "한밤의 레코드", color: "#F4F1EA" }]], weight: "bold", px: 132, x: 70, y: 250 },
  { name: "영문 부제", lines: [[{ text: "A NIGHT OF RECORDS AND QUIET SOUNDS", color: "#4C5372" }]], weight: "regular", px: 28, x: 74, y: 320 },
  { name: "일시", lines: [[{ text: "12.20(토) – 12.21(일) 오후 6시", color: "#8E4FB8" }]], weight: "bold", px: 46, x: 70, y: 640 },
  { name: "장소", lines: [[{ text: "성수 레코드홀 지하 1층", color: MUTED }]], weight: "light", px: 30, tracking: -120, x: 72, y: 830 },
  {
    name: "회차 안내",
    lines: [[{ text: "20일 ", color: MUTED }, { text: "매진", color: "#C8424A" }, { text: " · 21일 ", color: MUTED }, { text: "예매 가능", color: "#2E8B5A" }]],
    weight: "light", px: 28, x: 72, y: 935
  },
  {
    name: "가격",
    lines: [[{ text: "1일권 35,000원 · 2일권 60,000원", color: MUTED }], [{ text: "예매 ○○티켓 (12.1 오후 2시 오픈)", color: MUTED }]],
    weight: "light", px: 26, leading: 26, x: 72, y: 1040
  },
  { name: "접근성 안내", lines: [[{ text: "휠체어석 · 문자통역 · 진동 스피커", color: "#3D4259" }]], weight: "light", px: 24, x: 72, y: 1185 },
  { name: "주최", lines: [[{ text: "주최 ○○문화재단 · 후원 ○○구", color: "#363B52" }]], weight: "regular", px: 15, x: 72, y: 1300 }
];

const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };

// 글자를 그리고 투명한 테두리를 잘라 잉크 영역만 남겨요. 자간은 글자마다 띄워서 그려요
function renderText(t) {
  const font = `${t.px}px "${CSS[t.weight]}"`;
  const extra = ((t.tracking || 0) / 1000) * t.px;
  const probe = createCanvas(10, 10).getContext("2d");
  probe.font = font;
  const lineWidth = (runs) => runs.reduce((s, r) => s + [...r.text].reduce((a, ch) => a + probe.measureText(ch).width + extra, 0), 0);
  const leading = t.leading || Math.round(t.px * 1.2);
  const pad = Math.ceil(t.px * 0.6);
  const cw = Math.ceil(Math.max(...t.lines.map(lineWidth))) + pad * 2;
  const ch = Math.ceil(t.px * 1.4 + leading * (t.lines.length - 1)) + pad * 2;
  const c = createCanvas(cw, ch), ctx = c.getContext("2d");
  ctx.font = font; ctx.textBaseline = "alphabetic";
  const ox = pad, oy = pad + Math.ceil(t.px * 1.05);
  t.lines.forEach((runs, li) => {
    let x = ox;
    for (const r of runs) {
      ctx.fillStyle = r.color;
      for (const chr of r.text) { ctx.fillText(chr, x, oy + leading * li); x += ctx.measureText(chr).width + extra; }
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
  const canvas = createCanvas(tw, th);
  canvas.getContext("2d").putImageData(trimmed, 0, 0);
  const text = t.lines.map((runs) => runs.map((r) => r.text).join("")).join("\r"); // 포토샵 줄바꿈은 \r
  return { imageData: { width: tw, height: th, data: new Uint8ClampedArray(trimmed.data) }, left, top, right: left + tw, bottom: top + th, canvas, text };
}

// ag-psd 에 넘길 PSD 객체를 만들어요 (파일로 쓰지 않고 테스트·미리보기에서도 써요)
function build() {
  const comp = createCanvas(W, H), cctx = comp.getContext("2d");
  drawArtwork(cctx);
  const bg = cctx.getImageData(0, 0, W, H);
  const children = [{ id: 1, name: "배경 아트워크", left: 0, top: 0, right: W, bottom: H, imageData: { width: W, height: H, data: new Uint8ClampedArray(bg.data) } }];
  let id = 2;
  for (const t of TEXTS) {
    const r = renderText(t);
    cctx.drawImage(r.canvas, r.left, r.top);
    const style = (hex) => {
      const s = { font: { name: PS_FONT[t.weight] }, fontSize: t.px, fillColor: hexToRgb(hex), fauxBold: false };
      if (t.tracking) s.tracking = t.tracking;
      if (t.leading) { s.autoLeading = false; s.leading = t.leading; }
      return s;
    };
    const runs = t.lines.flatMap((rs, li) => rs.map((x, k) => ({ text: x.text + (li < t.lines.length - 1 && k === rs.length - 1 ? "\r" : ""), color: x.color })));
    children.push({
      id: id++, name: t.name, left: r.left, top: r.top, right: r.right, bottom: r.bottom, opacity: 1, imageData: r.imageData,
      text: {
        text: r.text,
        transform: [1, 0, 0, 1, t.x, t.y],
        style: style(runs[0].color),
        styleRuns: runs.length > 1 && new Set(runs.map((x) => x.color)).size > 1 ? runs.map((x) => ({ length: x.text.length, style: style(x.color) })) : undefined
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
  return { psd, preview: comp };
}

function main() {
  const agPsd = require("ag-psd");
  const out = path.join(__dirname, "..", "samples");
  const { psd, preview } = build();
  const buf = agPsd.writePsdBuffer(psd, { invalidateTextLayers: true });
  fs.writeFileSync(path.join(out, "sample-demo.psd"), buf);
  fs.writeFileSync(path.join(out, "sample-demo.preview.png"), preview.toBuffer("image/png"));
  console.log(`sample-demo.psd: ${W}x${H}px (SNS 세로), 텍스트 레이어 ${TEXTS.length}개, ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
}

if (require.main === module) main();
module.exports = { build, W, H, TEXTS };
