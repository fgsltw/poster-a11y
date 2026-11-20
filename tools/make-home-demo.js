/*
 * 홈 화면의 '이렇게 고쳐져요' 비교 그림을 만들어요.
 *
 *   npm run home-demo   →  web/home/{before,after}.jpg (보통 눈), web/home/{before,after}-low.jpg (저시력 눈)
 *
 * 샘플 포스터를 검사하고, 엔진이 '모두 적용'에 넣는 수정을 적용한 뒤,
 * 시력 0.3인 사람이 2m에서 본 모습(흐림)으로 바꿔 저장해요. 겹치는 크기 수정은 앱 기본값처럼 빼요.
 * 샘플 PSD(8MB)를 홈에서 바로 읽으면 느려서, 작은 JPG로 미리 만들어 둬요.
 * 샘플 PSD나 엔진 기준이 바뀌면 다시 돌려 주세요.
 */
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const { createCanvas } = require("@napi-rs/canvas");
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

function main() {
  const file = path.join(ROOT, "samples", "sample-poster.psd");
  const psd = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
  const doc = extractFromPsd(psd, { fileName: "sample-poster.psd" });
  const info = PurposeStore.empty();
  info.document = "info";
  PurposeStore.applyToDocument(doc, info);

  const check = Engine.checkDocument(doc, ENV);
  const fixes = Engine.toApplyFixes(check);
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
  const counts = check.summary.counts;
  console.log(`홈 비교 그림 → ${path.relative(ROOT, OUT)} (수정 ${fixes.length}개 적용, 고칠 곳 ${counts.fail + counts.conflict + counts.warn}개)`);
}

main();
