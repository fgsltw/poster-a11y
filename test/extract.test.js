// 샘플 PSD를 변환한 결과가 만들 때 넣은 값(정답)과 맞는지 확인합니다.
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const LD = require("../plugin/lib/layer-data.js");
const { extractFromPsd } = require("../src/psd-extract.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const dir = path.join(__dirname, "..", "samples");
const expected = JSON.parse(fs.readFileSync(path.join(dir, "sample-poster.expected.json"), "utf8"));
const psd = agPsd.readPsd(fs.readFileSync(path.join(dir, "sample-poster.psd")), { useImageData: true });
const data = extractFromPsd(psd, { fileName: "sample-poster.psd" });
const byId = Object.fromEntries(data.layers.map((l) => [l.id, l]));

test("문서 정보: 크기와 해상도", () => {
  assert.equal(data.schemaVersion, LD.SCHEMA_VERSION);
  assert.equal(data.document.widthPx, expected.widthPx);
  assert.equal(data.document.heightPx, expected.heightPx);
  assert.equal(data.document.ppi, expected.ppi);
  assert.ok(Math.abs(data.document.widthMm - 297) < 0.5);
});

test("텍스트 레이어를 모두 찾는다", () => {
  assert.equal(data.layers.length, expected.layers.length);
});

for (const e of expected.layers) {
  test(`레이어 '${e.name}': 내용·그룹·색·크기·위치`, () => {
    const l = byId[e.id];
    assert.ok(l, "레이어가 없음");
    assert.equal(l.text, e.text);
    assert.deepEqual(l.groupPath, e.groupPath);
    assert.equal(l.color, e.color);
    assert.ok(Math.abs(l.sizePx - e.sizePx) < 0.01, `sizePx ${l.sizePx} != ${e.sizePx}`);
    assert.ok(Math.abs(l.sizePt - e.sizePt) <= 0.1, `sizePt ${l.sizePt} != ${e.sizePt}`);
    assert.ok(Math.abs(l.opacity - e.opacity) < 0.01);
    assert.deepEqual(
      { left: l.bounds.left, top: l.bounds.top, right: l.bounds.right, bottom: l.bounds.bottom },
      e.bounds
    );
    assert.equal(l.key, `sample-poster.psd#${e.id}`);
    assert.equal(l.purpose, null);
  });
}

test("변형(크기 조절)된 글자는 실제 크기로 계산한다", () => {
  const l = data.layers.find((x) => x.text.startsWith("음성해설"));
  assert.equal(l.sizeDetail.sourcePx, 20);
  assert.equal(l.sizeDetail.transformScale, 1.5);
  assert.equal(l.sizePx, 30);
});

test("단색 배경 위 글자: 배경색이 정확하고 글자 픽셀이 섞이지 않는다", () => {
  for (const l of data.layers.filter((x) => x.groupPath[0] === "공연 정보")) {
    const s = l.background.stats;
    assert.equal(s.darkestColor, "#F4EEE2", l.text);
    assert.equal(s.lightestColor, "#F4EEE2", l.text);
    assert.ok(l.background.excludedTextPixels > 0);
  }
});

test("그림 위 글자: 배경 밝기 편차가 크게 잡힌다", () => {
  const l = data.layers.find((x) => x.text === "11월 8일 단 하루");
  assert.ok(l.background.stats.luminanceStdDev > 0.03, String(l.background.stats.luminanceStdDev));
  assert.ok(l.background.samples.length > 100 && l.background.samples.length <= 1024);
});

test("대비 계산 확인용: 일시 글자는 4.5:1 미만이다", () => {
  const l = data.layers.find((x) => x.text.startsWith("11.8"));
  const fg = LD.hexToRgb(l.color);
  const bg = LD.hexToRgb(l.background.stats.darkestColor);
  const L1 = LD.relativeLuminance(fg.r, fg.g, fg.b);
  const L2 = LD.relativeLuminance(bg.r, bg.g, bg.b);
  const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  assert.ok(ratio < 4.5 && ratio > 3, String(ratio));
});
