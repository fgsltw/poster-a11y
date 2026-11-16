// 검토에서 찾은 문제 고치기
//   1) 주최·후원 같은 부가 정보는 덜 엄격하게
//   2) 고칠 수 없는 저시력 경고를 남기지 않기
//   3) 같은 크기면 '공동 n위'
//   4) 글자색이 여러 가지면 기준에 못 미치는 색만 바꾸기
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const P = require("../engine/policies.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const { applyFixes, findLayer, WRITE_OPTIONS } = require("../src/psd-apply.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const file = path.join(__dirname, "..", "samples", "sample-poster.psd");
const read = () => agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
const psd = read();
const fresh = () => extractFromPsd(psd, { fileName: "sample-poster.psd" });
const find = (r, id, check) => r.results.find((x) => x.layerId === id && x.check === check);
const roundTrip = (p) => agPsd.readPsd(agPsd.writePsdBuffer(p, WRITE_OPTIONS), { useImageData: true });

// 샘플 레이어: 2 제목 · 4 영문 부제 · 5 그림 위 일정 · 6 일시 · 8 장소 · 9 가격 · 10 접근성 · 11 주최·후원

test("1) 주최·후원(그 외)은 낮은 기준(10′)으로 보고, 못 미치면 '참고' + 작은 추천 크기", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  const s11 = find(r, 11, "size");
  assert.equal(s11.role, "other");
  assert.equal(s11.status, "advisory");
  assert.equal(s11.detail.secondary, true);
  const s6 = find(r, 6, "size");
  assert.ok(s11.fix.valuePt < s6.fix.valuePt, `${s11.fix.valuePt} < ${s6.fix.valuePt}`);
  assert.ok(!E.toApplyFixes(r).some((f) => f.layerId === 11 && f.type === "size"), "'모두 추가'에는 안 들어가요");
  assert.ok(E.toApplyFixes(r, { includeAdvisory: true }).some((f) => f.layerId === 11 && f.type === "size"), "하나씩 추가는 돼요");
});

test("1) 핵심 정보(일시·장소·가격·접근성)는 그대로 엄격하게", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  for (const id of [6, 9, 10]) {
    const s = find(r, id, "size");
    assert.equal(s.detail.secondary, false);
    assert.equal(s.status, "fail", `레이어 ${id}`);
  }
});

test("2) 모두 고친 뒤 다시 검사하면 저시력 때문에 남는 '주의'가 없다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  const out = applyFixes(psd, E.toApplyFixes(r));
  const again = E.checkDocument(extractFromPsd(roundTrip(out.psd), { fileName: "after.psd" }), { medium: "wall" });
  const hier = again.results.filter((x) => x.check === "hierarchy" && x.status !== "pass");
  assert.equal(hier.length, 0, hier.map((x) => x.metric).join("\n"));
  // 저시력 정보는 통과한 크기 결과에 '참고'로만 남아요
  const s6 = find(again, 6, "size");
  assert.equal(s6.status, "pass");
  assert.equal(s6.detail.lowVisionReadable, false);
  assert.match(s6.metric, /참고: 저시력/);
});

test("2) 정책에서 저시력을 판정에 넣으면 통과 기준과 추천 크기가 올라간다", () => {
  const strict = JSON.parse(JSON.stringify(P));
  strict.size.lowVisionRequired = true;
  const normal = find(E.checkDocument(fresh(), { medium: "wall" }), 6, "size");
  const s = find(E.checkDocument(fresh(), { medium: "wall" }, strict), 6, "size");
  assert.ok(s.detail.passArcmin > 16 && s.detail.passArcmin < 17);
  assert.ok(s.fix.valuePt > normal.fix.valuePt);
  assert.doesNotMatch(s.metric, /참고: 저시력/);
});

test("3) 같은 크기의 글자는 '공동 n위'로 보여준다", () => {
  const d = fresh();
  for (const l of d.layers) if ([5, 6, 8].includes(l.id)) l.sizePt = 31;
  const r = E.checkDocument(d, { medium: "flyer" });
  const h = r.results.filter((x) => x.check === "hierarchy" && x.detail && x.detail.rank != null);
  assert.ok(h.length >= 3);
  for (const x of h) {
    assert.equal(x.detail.rank, 2, x.metric);
    assert.equal(x.detail.tied, 3);
    assert.match(x.metric, /공동 2위/);
  }
});

// 일시(6) 글자를 두 색으로: "11.8(토)" 회색(기준 미달) + " 19:30" 진한 빨강(통과)
function twoColorPsd() {
  const p = read();
  const t = findLayer(p.children, 6).layer.text;
  const base = t.style;
  t.styleRuns = [
    { length: 7, style: Object.assign({}, base, { fillColor: { r: 138, g: 132, b: 120 } }) },
    { length: t.text.length - 7, style: Object.assign({}, base, { fillColor: { r: 150, g: 20, b: 20 } }) }
  ];
  return p;
}

test("4) 글자색이 두 가지면 색마다 대비를 보고, 못 미치는 색만 바꾸자고 한다", () => {
  const d = extractFromPsd(twoColorPsd(), { fileName: "two.psd" });
  assert.equal(d.layers.find((l) => l.id === 6).colorRuns.length, 2);
  const c = find(E.checkDocument(d, { medium: "flyer" }), 6, "contrast");
  assert.equal(c.status, "fail");
  assert.equal(c.detail.runs.length, 2);
  assert.deepEqual(c.detail.runs.map((r) => r.passes), [false, true]);
  assert.match(c.metric, /가장 낮은 색 #8A8478/);
  assert.equal(c.fix.runs.length, 1);
  assert.equal(c.fix.runs[0].from, "#8A8478");
  assert.ok(E.toApplyFixes({ results: [c] })[0].runs, "수정 목록에도 색 구간이 들어가요");
});

test("4) 색 구간 수정을 적용하면 빨강은 그대로, 회색만 바뀌고 다시 검사하면 통과", () => {
  const src = twoColorPsd();
  const r = E.checkDocument(extractFromPsd(src, { fileName: "two.psd" }), { medium: "flyer" });
  const fixes = E.toApplyFixes(r).filter((f) => f.layerId === 6 && f.type === "color");
  assert.equal(fixes.length, 1);
  const out = applyFixes(src, fixes);
  assert.equal(out.skipped.length, 0, JSON.stringify(out.skipped));
  assert.match(out.applied[0].message, /그대로 둔 색: #961414/);

  const back = roundTrip(out.psd);
  const runs = findLayer(back.children, 6).layer.text.styleRuns;
  assert.deepEqual(
    [runs[1].style.fillColor.r, runs[1].style.fillColor.g, runs[1].style.fillColor.b].map(Math.round),
    [150, 20, 20],
    "빨강은 그대로"
  );
  assert.notEqual(Math.round(runs[0].style.fillColor.r), 138, "회색은 바뀜");
  const again = E.checkDocument(extractFromPsd(back, { fileName: "after.psd" }), { medium: "flyer" });
  assert.equal(find(again, 6, "contrast").status, "pass");
});

test("4) 예전 형식(value만 있는 색 수정)은 글자 전체를 바꾼다", () => {
  const out = applyFixes(twoColorPsd(), [{ layerId: 6, type: "color", value: "#222222" }]);
  const runs = findLayer(out.psd.children, 6).layer.text.styleRuns;
  for (const r of runs) assert.equal(r.style.fillColor.r, 0x22);
});
