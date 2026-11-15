// 수정 적용(접근성 버전 만들기)이 맞게 동작하는지 확인합니다.
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const LD = require("../plugin/lib/layer-data.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const { applyFixes, compositePsd, compareImageData, findLayer, WRITE_OPTIONS } = require("../src/psd-apply.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const file = path.join(__dirname, "..", "samples", "sample-poster.psd");
const original = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
const before = extractFromPsd(original, { fileName: "sample-poster.psd" });

const fixes = [
  { layerId: 6, type: "color", value: "#524D42" },
  { layerId: 11, type: "size", valuePt: 11 },
  { layerId: 11, type: "color", value: "#6E675B" },
  { layerId: 5, type: "backplate", color: "#1B1A2E", opacity: 0.85, paddingMm: 2 },
  { layerId: 999, type: "color", value: "#000000" },
  { layerId: 1, type: "color", value: "#000000" }
];
const result = applyFixes(original, fixes);

// 실제 파일로 썼다가 다시 읽은 결과로 확인해요 (저장까지 제대로 되는지)
const roundtrip = agPsd.readPsd(agPsd.writePsdBuffer(result.psd, WRITE_OPTIONS), { useImageData: true });
const after = extractFromPsd(roundtrip, { fileName: "after.psd" });
const layerAfter = (id) => after.layers.find((l) => l.id === id);
const layerBefore = (id) => before.layers.find((l) => l.id === id);

function contrast(hexA, hexB) {
  const a = LD.hexToRgb(hexA), b = LD.hexToRgb(hexB);
  const L1 = LD.relativeLuminance(a.r, a.g, a.b), L2 = LD.relativeLuminance(b.r, b.g, b.b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

test("다시 합성한 미리보기가 원본 합성 이미지와 같다", () => {
  const cmp = compareImageData(compositePsd(original).imageData, original.imageData);
  assert.ok(cmp.meanDiff < 2, `평균 차이 ${cmp.meanDiff}`);
  assert.equal(result.previewMatchesOriginal, true);
});

test("원본 PSD 객체는 바뀌지 않는다", () => {
  const again = extractFromPsd(original, { fileName: "sample-poster.psd" });
  assert.equal(again.layers.find((l) => l.id === 6).color, "#8A8478");
  assert.equal(again.layers.find((l) => l.id === 11).sizePt, layerBefore(11).sizePt);
  const f = findLayer(original.children, 5);
  assert.ok(!f.siblings.some((l) => /접근성 배경 띠/.test(l.name || "")), "원본에 배경 띠가 생기면 안 돼요");
});

test("적용·건너뜀 목록이 맞다", () => {
  assert.equal(result.applied.length, 4);
  assert.deepEqual(result.skipped.map((s) => s.fix.layerId).sort(), [1, 999]);
  assert.match(result.skipped.find((s) => s.fix.layerId === 1).reason, /텍스트 레이어가 아니에요/);
});

test("글자색: 데이터와 미리보기 픽셀이 모두 바뀌고 대비가 4.5:1을 넘는다", () => {
  const l = layerAfter(6);
  assert.equal(l.color, "#524D42");
  assert.ok(contrast(l.color, l.background.stats.darkestColor) >= 4.5);
  // 미리보기: 글자 영역에서 가장 어두운 픽셀이 새 색이어야 해요
  const img = roundtrip.imageData;
  let darkest = 1;
  for (let y = l.bounds.top; y < l.bounds.bottom; y++)
    for (let x = l.bounds.left; x < l.bounds.right; x++) {
      const i = (y * img.width + x) * 4;
      darkest = Math.min(darkest, LD.relativeLuminance(img.data[i], img.data[i + 1], img.data[i + 2]));
    }
  assert.ok(Math.abs(darkest - LD.relativeLuminance(0x52, 0x4d, 0x42)) < 0.01);
});

test("글자 크기: 11pt가 되고 미리보기 영역도 비율만큼 커진다", () => {
  const b = layerBefore(11), a = layerAfter(11);
  assert.equal(a.sizePt, 11);
  const ratio = a.bounds.width / b.bounds.width;
  assert.ok(Math.abs(ratio - 11 / b.sizePt) < 0.03, `비율 ${ratio}`);
  assert.equal(a.color, "#6E675B");
});

test("배경 띠: 글자 바로 아래에 새 레이어가 생기고 배경이 단순해진다", () => {
  const found = findLayer(roundtrip.children, 5);
  const plate = found.siblings[found.index - 1];
  assert.match(plate.name, /^접근성 배경 띠/);
  assert.equal(plate.id, result.applied.find((x) => x.fix.type === "backplate").createdLayerId);
  const pad = Math.round((2 / 25.4) * 150);
  assert.equal(plate.left, layerBefore(5).bounds.left - pad);
  assert.equal(plate.right, layerBefore(5).bounds.right + pad);

  const sBefore = layerBefore(5).background.stats, sAfter = layerAfter(5).background.stats;
  assert.ok(sAfter.luminanceStdDev < sBefore.luminanceStdDev / 3, `${sBefore.luminanceStdDev} → ${sAfter.luminanceStdDev}`);
  const worstBefore = Math.min(contrast("#C9763F", sBefore.darkestColor), contrast("#C9763F", sBefore.lightestColor));
  const worstAfter = Math.min(contrast("#C9763F", sAfter.darkestColor), contrast("#C9763F", sAfter.lightestColor));
  assert.ok(worstAfter > worstBefore, `${worstBefore} → ${worstAfter}`);
});

test("손대지 않은 레이어는 그대로다", () => {
  for (const id of [2, 4, 8, 9, 10]) {
    assert.equal(layerAfter(id).color, layerBefore(id).color);
    assert.equal(layerAfter(id).sizePt, layerBefore(id).sizePt);
    assert.deepEqual(layerAfter(id).bounds, layerBefore(id).bounds);
  }
});
