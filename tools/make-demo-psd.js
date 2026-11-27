/*
 * '샘플 포스터로 해보기'에 쓰는 시연용 PSD를 만들어요. (SNS 세로 이미지 1080×1350)
 *
 *   npm run sample:demo   →  samples/sample-demo.psd (+ .preview.png)
 *
 * 고친 전후 차이가 한눈에 드러나도록, 실제 디자이너가 만들 법한 2030 공연 포스터에 흔한 실수를 모았어요.
 * 디자인은 일부러 세련되게 두고, 문제는 '분위기를 위해 톤을 낮추고 작고 얇게 쓴' 수준이에요.
 * 고치는 방법은 모두 엔진 기준(engine/policies.js)이 정해요. 이 파일은 문제만 만들어요.
 *   - 회청색 정보 글자 (일반 눈 기준은 겨우, 저시력 기준 7:1엔 못 미침) → 같은 색 계열에서 밝게
 *   - 작고 얇은 정보 글자 (Semilight) → 겹치지 않는 만큼 키우고 굵게. 오른쪽에 여백을 넉넉히 둬요
 *   - 자간을 좁힌 장소 (-80) → 기본 간격
 *   - 줄 간격이 붙은 두 줄 티켓 정보 (약 1배) → 1.5배
 *   - 색만 다른 '매진'·'예매 가능' → 굵게 + 밑줄 / 굵게
 *   - 영문 전부 대문자 긴 문장 → 참고로 알려요
 *   제목·레코드 그림은 문제가 없게 둬서, 디자인은 그대로이고 정보만 또렷해지는 모습을 보여줘요.
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
// 레코드 판 한 장과 네온 빛 번짐. 글자 뒤는 단색으로 비워 둬요 (디자이너가 정보 영역을 따로 두는 흔한 구성)
const BG = "#0E1220";
function drawArtwork(ctx) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, c) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c); g.addColorStop(1, "rgba(14,18,32,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  glow(900, 260, 500, "rgba(232,64,150,0.55)");
  glow(1040, 640, 340, "rgba(60,190,230,0.35)");
  // 레코드 판: 검은 원 + 가는 홈 + 가운데 라벨 + 빛 반사
  const cx = 840, cy = 390, R = 330;
  ctx.fillStyle = "#06080F";
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1;
  for (let r = 130; r < R - 6; r += 5) {
    ctx.strokeStyle = r % 35 < 5 ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  const shine = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  shine.addColorStop(0.3, "rgba(255,255,255,0)"); shine.addColorStop(0.5, "rgba(255,255,255,0.07)"); shine.addColorStop(0.7, "rgba(255,255,255,0)");
  ctx.fillStyle = shine; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  const label = ctx.createLinearGradient(cx - 120, cy - 120, cx + 120, cy + 120);
  label.addColorStop(0, "#FF5FA2"); label.addColorStop(1, "#FF9A5A");
  ctx.fillStyle = label; ctx.beginPath(); ctx.arc(cx, cy, 118, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = BG; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
  // 정보 영역 위 가는 구분선
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(70, 735, W - 140, 2);
}

// ---------- 텍스트 레이어 ----------
// px: 글자 크기 · weight: regular | bold | light · tracking: 포토샵 자간(1/1000 em) · leading: 줄 간격(px, 여러 줄일 때)
// lines: 여러 줄 (줄마다 runs). runs: [{ text, color }] — 한 레이어 안에서 색만 다른 구간
// 정보 글자는 '분위기를 위해 톤을 낮춘' 회청색이에요. 일반 눈 기준(4.5:1)은 겨우 넘거나 조금 모자라고, 저시력 기준(7:1)엔 못 미쳐요
const LABEL = "#C2477F"; // 항목 이름: 레코드 라벨과 같은 분홍을 어둡게
const VALUE = "#7D8399"; // 정보 글자
const TEXTS = [
  { name: "시리즈", lines: [[{ text: "VOL.03  WINTER 2026", color: "#8C92A8" }]], weight: "regular", px: 22, tracking: 200, x: 72, y: 110 },
  { name: "제목", lines: [[{ text: "한밤의", color: "#F5F1E8" }], [{ text: "레코드", color: "#F5F1E8" }]], weight: "bold", px: 150, leading: 160, x: 66, y: 360 },
  { name: "영문 부제", lines: [[{ text: "A NIGHT OF RECORDS AND QUIET SOUNDS", color: "#6E7491" }]], weight: "regular", px: 22, tracking: 80, x: 72, y: 600 },
  { name: "일시 항목", lines: [[{ text: "일시", color: LABEL }]], weight: "bold", px: 20, x: 72, y: 815 },
  { name: "일시", lines: [[{ text: "12.20 토 — 12.21 일 · 오후 6시", color: VALUE }]], weight: "light", px: 30, x: 200, y: 818 },
  { name: "장소 항목", lines: [[{ text: "장소", color: LABEL }]], weight: "bold", px: 20, x: 72, y: 915 },
  { name: "장소", lines: [[{ text: "성수 레코드홀 지하 1층", color: VALUE }]], weight: "light", px: 30, tracking: -80, x: 200, y: 918 },
  { name: "회차 항목", lines: [[{ text: "회차", color: LABEL }]], weight: "bold", px: 20, x: 72, y: 1015 },
  {
    name: "회차 안내",
    lines: [[{ text: "20일 ", color: VALUE }, { text: "매진", color: "#C0504D" }, { text: " · 21일 ", color: VALUE }, { text: "예매 가능", color: "#3E9A6A" }]],
    weight: "light", px: 28, x: 200, y: 1018
  },
  { name: "티켓 항목", lines: [[{ text: "티켓", color: LABEL }]], weight: "bold", px: 20, x: 72, y: 1115 },
  {
    name: "가격",
    lines: [[{ text: "1일권 35,000원 · 2일권 60,000원", color: VALUE }], [{ text: "예매 ○○티켓 (12.1 오후 2시 오픈)", color: VALUE }]],
    weight: "light", px: 24, leading: 25, x: 200, y: 1116
  },
  { name: "접근성 항목", lines: [[{ text: "접근성", color: LABEL }]], weight: "bold", px: 20, x: 72, y: 1240 },
  { name: "접근성 안내", lines: [[{ text: "휠체어석 · 문자통역 · 진동 스피커", color: "#5F6580" }]], weight: "light", px: 22, x: 200, y: 1241 },
  { name: "주최", lines: [[{ text: "주최 ○○문화재단   후원 ○○구", color: "#4A4F66" }]], weight: "regular", px: 15, x: 72, y: 1318 }
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
