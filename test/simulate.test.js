// 시뮬레이션(색각이상·흐림·대비 저하·조명) 미리보기가 상식대로 동작하는지 확인합니다.
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const S = require("../src/simulate.js");
const LD = require("../plugin/lib/layer-data.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

function solid(w, h, hex) {
  const { r, g, b } = LD.hexToRgb(hex);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { width: w, height: h, data };
}
const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const lum = (p) => LD.relativeLuminance(p[0], p[1], p[2]);

test("색각이상: 흰색·회색·검정은 그대로다", () => {
  for (const type of ["protan", "deutan", "tritan"]) {
    for (const hex of ["#FFFFFF", "#808080", "#000000"]) {
      const out = S.applyColorVision(solid(2, 2, hex), type);
      const want = LD.hexToRgb(hex);
      const got = px(out, 0, 0);
      assert.ok(Math.abs(got[0] - want.r) <= 2 && Math.abs(got[1] - want.g) <= 2 && Math.abs(got[2] - want.b) <= 2, `${type} ${hex} → ${got}`);
    }
  }
});

test("색각이상: 적색맹·녹색맹에게 빨강과 초록이 비슷해진다", () => {
  const red = "#D03030", green = "#30A030";
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const before = distance(px(solid(1, 1, red), 0, 0), px(solid(1, 1, green), 0, 0));
  for (const type of ["protan", "deutan"]) {
    const after = distance(px(S.applyColorVision(solid(1, 1, red), type), 0, 0), px(S.applyColorVision(solid(1, 1, green), type), 0, 0));
    assert.ok(after < before / 2, `${type}: ${before.toFixed(0)} → ${after.toFixed(0)}`);
  }
});

test("대비 저하: 검정과 흰색 글자의 대비가 줄어든다", () => {
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const before = ratio(lum([0, 0, 0]), lum([255, 255, 255]));
  const k = lum(px(S.applyContrastLoss(solid(1, 1, "#000000"), 0.5), 0, 0));
  const w = lum(px(S.applyContrastLoss(solid(1, 1, "#FFFFFF"), 0.5), 0, 0));
  assert.ok(ratio(k, w) < before / 3, String(ratio(k, w)));
});

test("어두운 조명: 더 어두워지고, 아주 어두우면 더 어둡다", () => {
  const n = lum(px(solid(1, 1, "#F4EEE2"), 0, 0));
  const dim = lum(px(S.applyLighting(solid(1, 1, "#F4EEE2"), "dim"), 0, 0));
  const dark = lum(px(S.applyLighting(solid(1, 1, "#F4EEE2"), "dark"), 0, 0));
  assert.ok(n > dim && dim > dark);
});

test("흐림: 시력이 낮고 멀수록 많이 흐려진다", () => {
  const a = S.blurSigmaPx(2, 1.0, 150), b = S.blurSigmaPx(2, 0.1, 150), c = S.blurSigmaPx(4, 0.1, 150);
  assert.ok(a < b && b < c);
  assert.ok(Math.abs(b / a - 10) < 0.01, "시력 1/10 이면 흐림 10배");
});

test("흐림: 단색은 그대로이고, 날카로운 경계는 부드러워진다", () => {
  const flat = S.applyBlur(solid(40, 40, "#8A8478"), 4);
  assert.deepEqual(px(flat, 20, 20), [0x8a, 0x84, 0x78]);
  const edge = solid(60, 10, "#FFFFFF");
  for (let y = 0; y < 10; y++) for (let x = 0; x < 30; x++) { const i = (y * 60 + x) * 4; edge.data[i] = edge.data[i + 1] = edge.data[i + 2] = 0; }
  S.applyBlur(edge, 3);
  const mid = px(edge, 30, 5)[0];
  assert.ok(mid > 40 && mid < 215, `경계 픽셀 ${mid}`);
  assert.ok(px(edge, 2, 5)[0] < 10 && px(edge, 57, 5)[0] > 245, "경계에서 먼 곳은 거의 그대로");
});

test("샘플 포스터: 미리보기를 줄여서 만들고 설명을 붙인다", () => {
  const psd = agPsd.readPsd(fs.readFileSync(path.join(__dirname, "..", "samples", "sample-poster.psd")), {
    useImageData: true,
    skipLayerImageData: true
  });
  const before = Array.from(psd.imageData.data.subarray(0, 4000));
  const t0 = Date.now();
  const r = S.simulate(psd.imageData, { colorVision: "deutan", contrastLoss: 0.3, lighting: "dim", distanceM: 3, acuity: 0.3, ppi: 150, maxWidth: 600 });
  const ms = Date.now() - t0;
  assert.equal(r.image.width, 600);
  assert.equal(r.image.height, Math.round(psd.height * (600 / psd.width)));
  assert.equal(r.description.length, 4);
  assert.ok(r.blurSigmaPx > 0.3);
  assert.ok(ms < 5000, `${ms}ms`);
  // 원본 이미지는 바뀌지 않아요
  assert.deepEqual(Array.from(psd.imageData.data.subarray(0, 4000)), before);
});
