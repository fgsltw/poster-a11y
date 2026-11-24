/*
 * 홈 화면의 '이렇게 고쳐져요' 비교 그림을 만들어요.
 *
 *   npm run home-demo   →  web/home/{before,after}.jpg (보통 눈), web/home/{before,after}-low.jpg (저시력 눈)
 *                          web/home/{before,after}-cvd.jpg (적색맹 눈), web/home/{before,after}-field.jpg (시야 10°)
 *
 * 샘플 포스터를 검사하고, 엔진이 '모두 적용'에 넣는 수정을 적용한 뒤,
 * 시력 0.3인 사람이 2m에서 본 모습(흐림)으로 바꿔 저장해요.
 * 수정은 앱의 '자동으로 모두 고치기'와 같아요: 추천 크기로 키우면 겹치는 글자는 겹치지 않는 최대 크기(maxFitPt)까지만 키워요.
 * 색각이상·좁은 시야 그림은 그런 문제를 일부러 넣은 색 샘플(sample-color.psd)로 만들어요.
 *   - 적색맹: Machado 외(2009) 모델로 바꿔요
 *   - 시야 10°: 2m에서 한 번에 보이는 원(지름 = 2·거리·tan10°) 밖을 어둡게 해요.
 *     원본은 가장 큰 핵심 정보 묶음을, 고친 뒤는 새로 넣은 '핵심 정보 띠'를 보고 있을 때예요
 * 샘플 PSD(8MB)를 홈에서 바로 읽으면 느려서, 작은 JPG로 미리 만들어 둬요.
 * 샘플 PSD나 엔진 기준이 바뀌면 다시 돌려 주세요.
 */
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const { applyFixes } = require("../src/psd-apply.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const PurposeStore = require("../plugin/lib/purpose-store.js");
const Engine = require("../engine/engine.js");
const Simulate = require("../src/simulate.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("캔버스가 필요한 기능은 쓰지 않아요 (useImageData 사용)");
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })
);

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "web", "home");
// 벽 포스터를 2m에서 보는 저시력(0.3) 사람 기준 — 흐림 차이가 가장 잘 드러나요
//   (SNS 0.35m 기준은 흐림이 거의 안 보여서 비교 그림으로는 쓰지 않아요)
const VIEWER = "low";
const ENV = { medium: "wall", distanceM: 2, lighting: "normal", viewer: VIEWER, field: "normal" };
const WIDTH = 720; // 홈 화면에 쓰기 충분한 크기

function saveJpg(img, file) {
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  const d = ctx.createImageData(img.width, img.height);
  d.data.set(img.data);
  ctx.putImageData(d, 0, 0);
  fs.writeFileSync(file, c.toBuffer("image/jpeg", 82));
}

// 핵심 정보 띠 미리보기 글자 (웹의 renderStripText 와 같은 방식)
let fontReady = false;
function renderText(text, px, color, fontName) {
  if (!fontReady) {
    try { GlobalFonts.registerFromPath("C:/Windows/Fonts/malgunbd.ttf", "DemoBold"); } catch (e) { /* 없으면 기본 글꼴 */ }
    fontReady = true;
  }
  const lines = String(text).split(/\r?\n|\r/), font = `${px}px "DemoBold", "Malgun Gothic", sans-serif`;
  const m = createCanvas(10, 10).getContext("2d");
  m.font = font;
  const w = Math.ceil(Math.max(...lines.map((t) => m.measureText(t).width))) + 2, lh = Math.round(px * 1.35);
  const c = createCanvas(w, lh * lines.length), g = c.getContext("2d");
  g.font = font; g.fillStyle = color; g.textBaseline = "alphabetic";
  lines.forEach((t, i) => g.fillText(t, 0, Math.round(px * 1.05) + lh * i));
  const d = g.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: new Uint8ClampedArray(d.data) };
}

// 원(cx, cy, r) 밖을 어둡게 — 웹 마무리 화면의 '좁은 시야' 보기와 같은 방식
function tunnel(img, cx, cy, r) {
  const d = img.data;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const t = Math.min(1, Math.max(0, (Math.hypot(x - cx, y - cy) - r) / (r * 0.25)));
    if (!t) continue;
    const i = (y * img.width + x) * 4, keep = 1 - t * 0.92;
    d[i] *= keep; d[i + 1] *= keep; d[i + 2] *= keep;
  }
  return img;
}

// 앱의 '자동으로 모두 고치기'(autoFixPlan)와 같은 수정 목록
function autoFixes(check, doc) {
  const fixes = Engine.toApplyFixes(check);
  const has = new Set(fixes.map((f) => f.layerId + ":" + f.type));
  check.results.forEach((r) => {
    if (r.check !== "size" || !r.fix || !r.fix.layoutWarning || r.status === "advisory" || r.status === "pass") return;
    const l = doc.layers.find((x) => x.id === r.layerId), fit = r.fix.maxFitPt;
    if (!l || !fit || fit <= (l.sizePt || 0) + 0.25 || has.has(r.layerId + ":size")) return;
    fixes.push({ layerId: r.layerId, type: "size", valuePt: fit, reason: r.metric + " (겹치지 않는 최대 크기)" });
  });
  return fixes;
}

function loadInfo(name) {
  const psd = agPsd.readPsd(fs.readFileSync(path.join(ROOT, "samples", name)), { useImageData: true });
  const doc = extractFromPsd(psd, { fileName: name });
  const info = PurposeStore.empty();
  info.document = "info";
  PurposeStore.applyToDocument(doc, info);
  return { psd, doc };
}

// 색각이상·좁은 시야: 색 샘플로 만들어요
function colorAndField() {
  const { psd, doc } = loadInfo("sample-color.psd");
  const env = Object.assign({}, ENV, { field: "narrow" });
  const check = Engine.checkDocument(doc, env);
  const fixes = autoFixes(check, doc);
  const fixed = applyFixes(psd, fixes, { renderText }).psd;
  const save = (img, name, fn) => {
    const small = Simulate.downscale(img, WIDTH).image;
    saveJpg(fn(small, img.width / small.width), path.join(OUT, name));
  };
  // 적색맹: 빨강 '매진'·초록 '예매 가능'이 같아 보이고, 검은 띠 위 빨간 글자가 어두워져요
  const cvd = (img) => Simulate.applyColorVision(img, "protan");
  save(psd.imageData, "before-cvd.jpg", cvd);
  save(fixed.imageData, "after-cvd.jpg", cvd);
  // 시야 10°
  const field = check.results.find((r) => r.check === "field");
  const strip = fixes.find((f) => f.type === "infoStrip");
  if (!field || !field.detail.viewPx || !strip) throw new Error("색 샘플에서 시야 문제·핵심 정보 띠를 찾지 못했어요");
  const r = field.detail.viewPx / 2;
  const big = field.detail.clusters.slice().sort((a, b) => b.ids.length - a.ids.length)[0].box;
  const sf = field.fix; // 띠의 위치·크기 (toApplyFixes 에는 크기가 없어요)
  const sw = sf.widthPx || 0, sh = sf.heightPx || 0;
  save(psd.imageData, "before-field.jpg", (img, k) => tunnel(img, (big.left + big.right) / 2 / k, (big.top + big.bottom) / 2 / k, r / k));
  save(fixed.imageData, "after-field.jpg", (img, k) => tunnel(img, (sf.left + sw / 2) / k, (sf.top + sh / 2) / k, r / k));
  console.log(`색각이상·시야 비교 그림 (수정 ${fixes.length}개: ${fixes.map((f) => f.type).join(", ")})`);
}

function main() {
  const file = path.join(ROOT, "samples", "sample-poster.psd");
  const psd = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
  const doc = extractFromPsd(psd, { fileName: "sample-poster.psd" });
  const info = PurposeStore.empty();
  info.document = "info";
  PurposeStore.applyToDocument(doc, info);

  const check = Engine.checkDocument(doc, ENV);
  const fixes = autoFixes(check, doc);
  const fixed = applyFixes(psd, fixes).psd;

  fs.mkdirSync(OUT, { recursive: true });
  const ppi = doc.document.ppi;
  const SIM = { acuity: Engine.DEFAULT_POLICIES.viewers[VIEWER].acuity, distanceM: ENV.distanceM };
  const shots = [
    ["before.jpg", psd.imageData, null],
    ["after.jpg", fixed.imageData, null],
    ["before-low.jpg", psd.imageData, SIM],
    ["after-low.jpg", fixed.imageData, SIM]
  ];
  for (const [name, img, sim] of shots) {
    // 흐림은 원래 해상도 기준으로 계산하고, 저장할 때만 작게 줄여요
    const out = sim ? Simulate.simulate(img, Object.assign({ ppi, maxWidth: WIDTH }, sim)).image : Simulate.downscale(img, WIDTH).image;
    saveJpg(out, path.join(OUT, name));
  }
  colorAndField();
  const counts = check.summary.counts;
  console.log(`홈 비교 그림 → ${path.relative(ROOT, OUT)} (수정 ${fixes.length}개 적용, 고칠 곳 ${counts.fail + counts.conflict + counts.warn}개)`);
}

main();
