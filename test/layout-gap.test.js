// 글자를 키울 때 줄 사이가 너무 좁아지지 않는지 확인합니다.
//   (자동으로 모두 고친 뒤 다시 검사하면 '글자 묶음이 너무 붙어 있어요'가 새로 생기면 안 돼요)
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const P = require("../engine/policies.js");
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
const crowdedPairs = (r) =>
  r.results.filter((x) => x.check === "hierarchy" && x.detail && x.detail.crowdedWith != null).map((x) => x.detail.crowdedWith + ">" + x.layerId);

// 웹 '자동으로 모두 고치기'와 같은 크기 수정: 겹치거나 줄 사이가 좁아지면 '겹치지 않는 최대 크기'까지만
function autoSizeFixes(r) {
  return E.toApplyFixes(r, { includeLayoutConflicts: true })
    .filter((f) => f.type === "size")
    .map((f) => {
      const s = r.results.find((x) => x.layerId === f.layerId && x.check === "size");
      return s.fix.layoutWarning ? (s.fix.maxFitPt > 0 ? Object.assign({}, f, { valuePt: s.fix.maxFitPt }) : null) : f;
    })
    .filter(Boolean);
}

test("저시력 기준으로 모두 키워도 줄 사이가 '붙어 있음'이 되지 않는다", () => {
  for (const name of ["sample-poster.psd", "sample-color.psd", "sample-showcase.psd"]) {
    for (const env of [{ medium: "sns", viewer: "low" }, { medium: "wall", viewer: "disability" }]) {
      const psd = read(name, "info");
      const before = E.checkDocument(extractFromPsd(psd, { fileName: name }), env);
      const fixes = autoSizeFixes(before);
      if (!fixes.length) continue;
      const back = agPsd.readPsd(agPsd.writePsdBuffer(applyFixes(psd, fixes).psd, WRITE_OPTIONS), { useImageData: true });
      const after = E.checkDocument(extractFromPsd(back, { fileName: "after.psd" }), env);
      const had = new Set(crowdedPairs(before));
      const added = crowdedPairs(after).filter((p) => !had.has(p));
      assert.deepEqual(added, [], `${name} ${env.medium} ${env.viewer}`);
    }
  }
});

// 글자 두 개만 있는 작은 문서: 위 글자 A 아래에 B. 둘 다 왼쪽 정렬, 폭은 좁게 (포스터 밖으로 나가지 않게)
function twoLines(gapPx) {
  const doc = extractFromPsd(read("sample-poster.psd", "info"), { fileName: "p.psd" });
  const a = doc.layers.find((l) => l.id === 6), b = doc.layers.find((l) => l.id === 8);
  const place = (l, top) => {
    const h = l.bounds.bottom - l.bounds.top;
    l.bounds = Object.assign({}, l.bounds, { left: 150, right: 350, top, bottom: top + h, width: 200 });
    l.origin = { x: 150, y: top + h };
  };
  place(a, 1500);
  place(b, a.bounds.bottom + gapPx);
  doc.layers = [a, b];
  return { doc, a, b };
}

test("추천 크기로 키우면 겹치지는 않아도 줄 사이가 너무 좁아질 때: 경고하고 최대 크기를 준다", () => {
  // 사이 90px: B가 위로 커져도 A와 겹치지는 않지만, 줄 사이가 글자 크기 × 0.3보다 좁아져요 (70~105px가 이 경우)
  const { doc, b } = twoLines(90);
  const r = E.checkDocument(doc, { medium: "sns", viewer: "low" });
  const lay = r.results.find((x) => x.layerId === b.id && x.check === "layout");
  assert.ok(lay && lay.status === "warn", lay && lay.metric);
  assert.deepEqual(lay.detail.overlapsWith, [], "겹치지는 않아요");
  assert.deepEqual(lay.detail.tooCloseTo, [6]);
  assert.match(lay.metric, /줄 사이가 너무 좁아져요/);
  const size = r.results.find((x) => x.layerId === b.id && x.check === "size");
  assert.ok(size.fix.layoutWarning && size.fix.maxFitPt > b.sizePt, JSON.stringify(size.fix));
});

test("원래부터 좁은 줄 사이는 막지 않아요: 지금보다 더 좁아지지만 않으면 키울 수 있어요", () => {
  const { doc, a, b } = twoLines(2); // 원래 디자인이 이미 '붙어 있음'
  // B는 이미 충분히 커서 키우지 않아요 → A만 커져요
  b.sizePx = 240; b.sizePt = Math.round(((240 * 72) / doc.document.ppi) * 10) / 10;
  const r = E.checkDocument(doc, { medium: "sns", viewer: "low" });
  assert.ok(!r.results.find((x) => x.layerId === b.id && x.check === "size").fix, "B는 키우지 않아요");
  const s = r.results.find((x) => x.layerId === a.id && x.check === "size");
  // 위 글자 A는 위쪽으로 커져서 B와의 사이가 그대로라, 추천 크기까지 키울 수 있어야 해요
  assert.ok(s.fix && !s.fix.layoutWarning, JSON.stringify(s.fix));
});

test("줄 사이 기준은 정보 계층의 '붙어 있음' 기준 하나를 같이 써요", () => {
  assert.equal(typeof P.hierarchy.crowdedGapEm, "number");
  assert.equal(P.layout.fitGapOfHeight, undefined, "따로 두던 줄 사이 기준은 없어졌어요");
});
