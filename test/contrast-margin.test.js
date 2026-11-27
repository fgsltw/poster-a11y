// 대비를 고칠 때 10% 여유 (policies.contrast.fixMargin): 합격선은 그대로, 고칠 목표만 기준 × 1.1
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const P = require("../engine/policies.js");
const { extractFromPsd } = require("../src/psd-extract.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const psd = agPsd.readPsd(fs.readFileSync(path.join(__dirname, "..", "samples", "sample-poster.psd")), { useImageData: true });
const fresh = () => extractFromPsd(psd, { fileName: "sample-poster.psd" });
const contrastOf = (r, id) => r.results.find((x) => x.layerId === id && x.check === "contrast");

test("여유 값은 policies 한 곳에 (1.1)", () => {
  assert.equal(P.contrast.fixMargin, 1.1);
});

test("합격선은 그대로, 고친 색은 기준 × 1.1 근처까지 (일시 3.22 → 약 5.0, 기준 4.5)", () => {
  const c = contrastOf(E.checkDocument(fresh(), { medium: "sns" }), 6);
  assert.equal(c.detail.target, 4.5);
  assert.equal(c.fix.contrastBefore, 3.22);
  assert.ok(c.fix.contrastAfter >= 4.5 * 1.1 - 0.05, String(c.fix.contrastAfter));
  assert.ok(c.fix.contrastAfter < 4.5 * 1.1 + 0.5, "너무 많이 바꾸지는 않아요");
});

test("여유를 1로 두면 예전처럼 기준을 겨우 넘기는 색", () => {
  const pol = JSON.parse(JSON.stringify(P));
  pol.contrast.fixMargin = 1;
  const c = contrastOf(E.checkDocument(fresh(), { medium: "sns" }, pol), 6);
  assert.ok(c.fix.contrastAfter >= 4.5 && c.fix.contrastAfter < 4.8, String(c.fix.contrastAfter));
});

test("여유만큼 못 바꿔도 기준까지는 고쳐요 (밝기를 조금만 바꿀 수 있을 때)", () => {
  const pol = JSON.parse(JSON.stringify(P));
  pol.contrast.fixMargin = 3; // 일부러 닿을 수 없는 목표
  const c = contrastOf(E.checkDocument(fresh(), { medium: "sns" }, pol), 6);
  assert.ok(c.fix && c.fix.contrastAfter >= 4.5);
});

test("고친 PSD를 다시 검사하면 대비 통과", () => {
  const d = fresh();
  const r = E.checkDocument(d, { medium: "sns" });
  const fix = contrastOf(r, 6).fix;
  d.layers.find((l) => l.id === 6).color = fix.value;
  const l6 = d.layers.find((l) => l.id === 6);
  if (l6.runs) l6.runs.forEach((run) => (run.color = fix.value));
  assert.equal(contrastOf(E.checkDocument(d, { medium: "sns" }), 6).status, "pass");
});
