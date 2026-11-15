// 인쇄용 CMYK 포스터를 읽고 고칠 수 있는지 확인합니다.
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const LD = require("../plugin/lib/layer-data.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const { applyFixes, WRITE_OPTIONS } = require("../src/psd-apply.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const dir = path.join(__dirname, "..", "samples");
const expected = JSON.parse(fs.readFileSync(path.join(dir, "sample-poster-cmyk.expected.json"), "utf8"));
const psd = agPsd.readPsd(fs.readFileSync(path.join(dir, "sample-poster-cmyk.psd")), { useImageData: true });
const data = extractFromPsd(psd, { fileName: "sample-poster-cmyk.psd" });

function colorDiff(a, b) {
  const x = LD.hexToRgb(a), y = LD.hexToRgb(b);
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
}
function contrast(hexA, hexB) {
  const a = LD.hexToRgb(hexA), b = LD.hexToRgb(hexB);
  const L1 = LD.relativeLuminance(a.r, a.g, a.b), L2 = LD.relativeLuminance(b.r, b.g, b.b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

test("CMYK ↔ RGB 변환: 인쇄 가능한 색은 왕복해도 같다", () => {
  for (const hex of ["#8A8478", "#524D42", "#C9763F", "#2F5D50", "#F4EEE2", "#FFFFFF", "#1B1A2E"]) {
    const { r, g, b } = LD.hexToRgb(hex);
    const ink = LD.rgbToCmyk(r, g, b);
    const back = LD.cmykToRgb(ink.c, ink.m, ink.y, ink.k);
    assert.ok(colorDiff(hex, LD.toHex(back.r, back.g, back.b)) <= 1, hex);
  }
});

test("CMYK ↔ RGB 변환: 인쇄로 낼 수 없는 색은 오차를 알려준다", () => {
  assert.ok(LD.rgbToCmyk(0, 255, 0).error > 50);
});

test("CMYK 문서라고 알려주고 경고를 남긴다", () => {
  assert.equal(data.document.colorMode, "CMYK");
  assert.ok(data.warnings.some((w) => w.includes("CMYK")));
});

for (const e of expected.layers) {
  test(`CMYK 레이어 '${e.name}': 글자색과 원래 CMYK 값`, () => {
    const l = data.layers.find((x) => x.id === e.id);
    assert.ok(colorDiff(l.color, e.color) <= 2, `${l.color} vs ${e.color}`);
    assert.equal(l.colorSource.space, "cmyk");
    assert.deepEqual(l.colorSource.cmyk, e.cmyk);
    assert.equal(l.sizePt, e.sizePt);
  });
}

test("CMYK 배경 픽셀도 읽힌다", () => {
  const l = data.layers.find((x) => x.text.startsWith("11.8"));
  assert.ok(colorDiff(l.background.stats.darkestColor, "#F4EEE2") <= 2);
  assert.ok(contrast(l.color, l.background.stats.darkestColor) < 4.5);
});

test("CMYK 문서에 글자색 수정을 넣으면 CMYK 값으로 저장되고 대비가 좋아진다", () => {
  const r = applyFixes(psd, [{ layerId: 6, type: "color", value: "#524D42" }]);
  assert.equal(r.applied.length, 1);
  assert.match(r.applied[0].message, /CMYK \d+\/\d+\/\d+\/\d+/);
  const back = agPsd.readPsd(agPsd.writePsdBuffer(r.psd, WRITE_OPTIONS), { useImageData: true });
  assert.equal(back.colorMode, 4);
  const after = extractFromPsd(back, { fileName: "after.psd" }).layers.find((x) => x.id === 6);
  assert.equal(after.colorSource.space, "cmyk");
  assert.ok(colorDiff(after.color, "#524D42") <= 2, after.color);
  assert.ok(contrast(after.color, after.background.stats.darkestColor) >= 4.5);
});

test("CMYK 문서에 인쇄로 낼 수 없는 색을 넣으면 가장 가까운 색으로 바꾸고 알려준다", () => {
  const r = applyFixes(psd, [{ layerId: 6, type: "color", value: "#00FF00" }]);
  assert.match(r.applied[0].message, /인쇄로 낼 수 없는 색/);
});
