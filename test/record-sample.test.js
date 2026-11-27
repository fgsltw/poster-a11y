// 대표 샘플 '한밤의 레코드' (samples/sample-record.psd): 홈 비교 그림과 '샘플로 해보기'에 써요.
//   자동으로 고치면 '가장 좋은 결과'가 나와야 해요 — 겹침 없이 커지고, 강조는 매진·예매 가능에, 배경 띠는 없이.
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const PurposeStore = require("../plugin/lib/purpose-store.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const { applyFixes } = require("../src/psd-apply.js");

agPsd.initializeCanvas(() => { throw new Error("no canvas"); }, (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));

const file = path.join(__dirname, "..", "samples", "sample-record.psd");
const read = () => agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
const ENV = { medium: "wall", distanceM: 2, viewer: "low", field: "narrow" };
const check = () => {
  const doc = extractFromPsd(read(), { fileName: "sample-record.psd" });
  const info = PurposeStore.empty();
  info.document = "info";
  PurposeStore.applyToDocument(doc, info);
  return E.checkDocument(doc, ENV);
};

test("대표 샘플: 핵심 정보 글자는 겹치지 않고 추천 크기까지 커져요", () => {
  const r = check();
  const sizes = r.results.filter((x) => x.check === "size" && x.status === "warn");
  assert.ok(sizes.length >= 5, "일시·장소·회차·티켓·접근성");
  sizes.forEach((x) => assert.ok(!x.fix.layoutWarning, x.layerName + ": " + x.fix.layoutWarning));
});

test("대표 샘플: 색만 다른 강조는 '매진'·'예매 가능'에, 배경 띠는 없어요", () => {
  const r = check();
  const emph = r.results.find((x) => x.check === "colorOnly");
  assert.ok(emph && emph.fix && emph.fix.type === "emphasis");
  assert.match(emph.metric, /매진/);
  assert.match(emph.metric, /예매 가능/);
  const fixes = E.toApplyFixes(r);
  assert.equal(fixes.filter((f) => f.type === "backplate").length, 0);
  const out = applyFixes(read(), fixes);
  assert.deepEqual(out.skipped, []);
});
