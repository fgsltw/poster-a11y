// 색각이상·좁은 시야 시연용 샘플 (samples/sample-color.psd)
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const C = require("../engine/color.js");
const PurposeStore = require("../plugin/lib/purpose-store.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const { applyFixes } = require("../src/psd-apply.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const file = path.join(__dirname, "..", "samples", "sample-color.psd");
const read = () => agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
const check = (env) => {
  const doc = extractFromPsd(read(), { fileName: "sample-color.psd" });
  const info = PurposeStore.empty();
  info.document = "info";
  PurposeStore.applyToDocument(doc, info);
  return E.checkDocument(doc, env);
};
const named = (r, name) => r.results.filter((x) => x.layerName === name);

test("색만 다른 강조(매진·예매 가능)를 찾고, 밝기만 바꾸는 수정을 줘요", () => {
  const r = check({ medium: "wall", viewer: "low", field: "narrow" });
  const x = named(r, "일시").find((y) => y.check === "colorOnly");
  assert.equal(x.status, "warn");
  assert.ok(x.detail.lostFor.includes("deutan"));
  assert.equal(x.fix.type, "color");
  assert.equal(x.fix.passes, true);
});

test("검은 띠 위 빨간 글자: 보통 눈은 통과, 색각이상 대비 수정이 있어요", () => {
  const r = check({ medium: "wall", viewer: "low", field: "narrow" });
  assert.equal(named(r, "우천 안내").find((y) => y.check === "contrast").status, "pass");
  const x = named(r, "우천 안내").find((y) => y.check === "cvd");
  assert.equal(x.status, "warn");
  assert.equal(x.fix.passes, true);
});

test("벽 포스터를 좁은 시야로 보면 핵심 정보가 흩어져 있어요 (휴대폰 화면에서는 한눈에)", () => {
  assert.equal(check({ medium: "wall", viewer: "low", field: "narrow" }).results.find((y) => y.check === "field").status, "warn");
  assert.equal(check({ medium: "wall", viewer: "low", field: "veryNarrow" }).results.find((y) => y.check === "field").status, "fail");
  assert.equal(check({ medium: "sns", viewer: "low", field: "narrow" }).results.find((y) => y.check === "field").status, "pass");
});

test("색 수정을 넣은 PSD: 바뀐 강조색은 녹색맹 눈으로도 '예매 가능'과 구분돼요", () => {
  const r = check({ medium: "wall", viewer: "low", field: "narrow" });
  const x = named(r, "일시").find((y) => y.check === "colorOnly");
  const fix = E.toApplyFixes({ results: [x] })[0];
  const out = applyFixes(read(), [fix]);
  assert.equal(out.applied.length, 1);
  const after = extractFromPsd(out.psd, { fileName: "x.psd" }).layers.find((l) => l.name === "일시");
  const colors = after.styleRuns.map((s) => s.color.toUpperCase());
  assert.ok(colors.includes(fix.runs[0].value.toUpperCase()), "바뀐 색이 글자 구간에 들어가요");
  const green = C.hexToRgb("#2E7D32"), nu = C.hexToRgb(fix.runs[0].value);
  assert.ok(C.deltaE(C.simulateCvd(nu, "deutan"), C.simulateCvd(green, "deutan")) >= 0.12);
});
