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

test("색만 다른 강조(매진·예매 가능)를 찾고, 모양으로 구분하는 수정을 줘요", () => {
  const r = check({ medium: "wall", viewer: "low", field: "narrow" });
  const x = named(r, "일시").find((y) => y.check === "colorOnly");
  assert.equal(x.status, "warn");
  assert.ok(x.detail.lostFor.includes("deutan"));
  assert.equal(x.fix.type, "emphasis");
  assert.equal(x.fix.runs[0].from, "#C62828", "짧은 쪽 '매진'");
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

test("강조 수정을 넣은 PSD: '매진' 구간만 굵게·밑줄, 다른 구간은 그대로", () => {
  const r = check({ medium: "wall", viewer: "low", field: "narrow" });
  const x = named(r, "일시").find((y) => y.check === "colorOnly");
  const fix = E.toApplyFixes({ results: [x] })[0];
  assert.equal(fix.type, "emphasis");
  const out = applyFixes(read(), [fix]);
  assert.equal(out.applied.length, 1, JSON.stringify(out.skipped));
  const after = extractFromPsd(out.psd, { fileName: "x.psd" }).layers.find((l) => l.name === "일시");
  const emph = after.styleRuns.filter((s) => s.bold && s.underline);
  assert.equal(emph.length, 1);
  assert.equal(emph[0].text.trim(), "매진");
  if (fix.runs[0].value) assert.equal(emph[0].color.toUpperCase(), fix.runs[0].value.toUpperCase());
  assert.ok(after.styleRuns.filter((s) => !s.bold).length >= 2, "나머지는 그대로");
});

test("좁은 시야: '핵심 정보 띠' 수정 → 새 글자 레이어가 생기고, 다시 검사하면 한눈에 보여요", () => {
  const env = { medium: "wall", viewer: "low", field: "narrow" };
  const r = check(env);
  const field = r.results.find((y) => y.check === "field");
  assert.equal(field.fix.type, "infoStrip");
  assert.match(field.fix.text, /7\.19/);
  assert.match(field.fix.text, /노들섬/);
  assert.match(field.fix.text, /30,000원/);
  const fix = E.toApplyFixes(r).find((f) => f.type === "infoStrip");
  assert.ok(fix, "기본 수정 목록에 들어가요");
  // 미리보기 그림 그리기 (Node 에서는 @napi-rs/canvas)
  const { createCanvas } = require("@napi-rs/canvas");
  const renderText = (text, px, color) => {
    const lines = text.split(/\n/), c = createCanvas(Math.ceil(px * 20), Math.ceil(px * 1.35 * lines.length)), g = c.getContext("2d");
    g.font = `${px}px sans-serif`; g.fillStyle = color;
    lines.forEach((t, i) => g.fillText(t, 0, px * (1.05 + 1.35 * i)));
    const d = g.getImageData(0, 0, c.width, c.height);
    return { width: d.width, height: d.height, data: new Uint8ClampedArray(d.data) };
  };
  const out = applyFixes(read(), [fix], { renderText });
  assert.equal(out.applied.length, 1, JSON.stringify(out.skipped));
  const doc = extractFromPsd(out.psd, { fileName: "x.psd" });
  const strip = doc.layers.find((l) => /핵심 정보 띠/.test(l.name));
  assert.ok(strip, "새 글자 레이어");
  assert.equal(doc.layers.filter((l) => l.name === "일시").length, 1, "원래 글자는 그대로");
  const info = PurposeStore.empty();
  info.document = "info";
  PurposeStore.applyToDocument(doc, info);
  const again = E.checkDocument(doc, env).results.find((y) => y.check === "field");
  assert.equal(again.status, "pass");
});
