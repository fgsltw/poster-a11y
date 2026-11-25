// 색만 다른 강조가 여러 개일 때: 강조마다 다른 모양으로 고치고, 고친 뒤 다시 검사하면 통과하는지 확인합니다.
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const LD = require("../plugin/lib/layer-data.js");
const PS = require("../plugin/lib/purpose-store.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const { applyFixes, WRITE_OPTIONS } = require("../src/psd-apply.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const read = (name, purpose) => {
  const psd = agPsd.readPsd(fs.readFileSync(path.join(__dirname, "..", "samples", name)), { useImageData: true });
  if (purpose) PS.writeToPsd(psd, { document: purpose });
  return psd;
};
const colorOnlyOf = (r, id) => r.results.find((x) => x.layerId === id && x.check === "colorOnly");

// 쇼케이스 레이어 5: "주말 매진 · 평일 예매 가능" — 회색 본문 + 빨강 '매진' + 초록 '예매 가능'
test("강조가 둘이면 서로 다른 모양: 매진=굵게+밑줄, 예매 가능=굵게", () => {
  const doc = extractFromPsd(read("sample-showcase.psd", "info"), { fileName: "s.psd" });
  const x = colorOnlyOf(E.checkDocument(doc, { medium: "sns", viewer: "low" }), 5);
  assert.equal(x.fix.type, "emphasis");
  assert.equal(x.fix.passes, true);
  const byColor = Object.fromEntries(x.fix.runs.map((r) => [r.from, r]));
  assert.deepEqual(Object.keys(byColor).sort(), ["#30A46C", "#E5484D"]);
  assert.equal(byColor["#E5484D"].bold && byColor["#E5484D"].underline, true);
  assert.equal(byColor["#30A46C"].bold, true);
  assert.ok(!byColor["#30A46C"].underline, "두 강조의 모양이 달라야 해요");
  assert.ok(!x.fix.runs.some((r) => r.from === "#A3A9B3"), "본문(회색)은 그대로");
  assert.match(x.message, /강조끼리도/);
});

test("모두 고치고 다시 검사하면 '색만 다른 강조'가 남지 않는다 (글자색 수정과 함께여도)", () => {
  for (const [name, id] of [["sample-showcase.psd", 5], ["sample-color.psd", 3]]) {
    for (const env of [{ medium: "sns", viewer: "low" }, { medium: "wall" }]) {
      const psd = read(name, "info");
      const before = E.checkDocument(extractFromPsd(psd, { fileName: name }), env);
      const fixes = E.toApplyFixes(before).filter((f) => f.type !== "infoStrip");
      const r = applyFixes(psd, fixes);
      assert.equal(r.skipped.length, 0, `${name} ${env.medium}: ${JSON.stringify(r.skipped.map((s) => s.reason))}`);
      const back = agPsd.readPsd(agPsd.writePsdBuffer(r.psd, WRITE_OPTIONS), { useImageData: true });
      const after = colorOnlyOf(E.checkDocument(extractFromPsd(back, { fileName: "after.psd" }), env), id);
      assert.ok(!after || after.status === "pass", `${name} ${env.medium}: ${after && after.metric}`);
    }
  }
});

test("미리보기: 강조 색마다 자기 색으로 그려요 (초록 강조가 빨강으로 바뀌지 않음)", () => {
  const psd = read("sample-showcase.psd", "info");
  const doc = extractFromPsd(psd, { fileName: "s.psd" });
  const fix = colorOnlyOf(E.checkDocument(doc, { medium: "sns", viewer: "low" }), 5).fix;
  const r = applyFixes(psd, [Object.assign({ layerId: 5 }, fix)]);
  const find = (children) => {
    for (const c of children || []) {
      if (c.id === 5) return c;
      const f = find(c.children);
      if (f) return f;
    }
  };
  const img = find(r.psd.children).imageData;
  const count = (hex) => {
    const c = LD.hexToRgb(hex);
    let n = 0;
    for (let i = 0; i < img.data.length; i += 4)
      if (img.data[i + 3] > 200 && Math.abs(img.data[i] - c.r) + Math.abs(img.data[i + 1] - c.g) + Math.abs(img.data[i + 2] - c.b) < 30) n++;
    return n;
  };
  const red = fix.runs.find((x) => x.from === "#E5484D");
  assert.ok(count(red.value || "#E5484D") > 50, "빨강 강조");
  assert.ok(count("#30A46C") > 50, "초록 강조가 자기 색으로 남아 있어야 해요");
});

test("강조가 하나일 때: 글자 수가 같아도 본문이 아니라 강조 쪽을 굵게", () => {
  // "주말"(2자)과 "매진"(2자)처럼 구간 글자 수가 같으면 전에는 본문을 고를 때가 있었어요
  const doc = extractFromPsd(read("sample-showcase.psd", "info"), { fileName: "s.psd" });
  const l = doc.layers.find((x) => x.id === 5);
  l.styleRuns = [
    { text: "주말 ", color: "#3C8CDF", sizePx: 40 },
    { text: "매진", color: "#C762DD", sizePx: 40 },
    { text: " · 평일 예매", color: "#3C8CDF", sizePx: 40 }
  ];
  l.colorRuns = ["#3C8CDF", "#C762DD"];
  l.color = "#3C8CDF";
  const x = colorOnlyOf(E.checkDocument(doc, { medium: "sns" }), 5);
  assert.ok(x && x.fix, "색만 다른 강조로 잡혀야 해요");
  assert.deepEqual(x.fix.runs.map((r) => r.from), ["#C762DD"]);
});
