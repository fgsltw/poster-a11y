// 6가지 기준 중 ① 얇은 글씨 · ③ 확대 후 잘림·겹침 · ④ 텍스트 간격 · ⑤ 정보 계층·그룹화
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const LD_VERSION = require("../plugin/lib/layer-data.js").SCHEMA_VERSION;
const { applyFixes, findLayer, WRITE_OPTIONS } = require("../src/psd-apply.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const file = path.join(__dirname, "..", "samples", "sample-poster.psd");
const psd = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
const fresh = () => extractFromPsd(psd, { fileName: "sample-poster.psd" });
const layer = (d, id) => d.layers.find((l) => l.id === id);
const of = (r, id, check) => r.results.filter((x) => x.layerId === id && x.check === check);

// 레이어를 dx, dy 만큼 옮겨요 (상자와 기준점 함께)
function move(l, dx, dy) {
  const b = l.bounds;
  l.bounds = Object.assign({}, b, { left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy });
  if (l.origin) l.origin = { x: l.origin.x + dx, y: l.origin.y + dy };
}

// 샘플 레이어: 2 제목 · 4 영문 부제 · 5 그림 위 일정 · 6 일시 · 8 장소 · 9 가격 · 10 접근성 · 11 후원

test("레이어 데이터 v0.3: 기준점과 줄·글자 간격을 담는다", () => {
  const d = fresh();
  assert.equal(d.schemaVersion, LD_VERSION);
  const l = layer(d, 6);
  assert.deepEqual(l.origin, { x: 150, y: 1520 });
  assert.equal(l.spacing.lineCount, 1);
  assert.equal(l.spacing.lineHeightRatio, 1.2); // 포토샵 자동 줄 간격
  assert.equal(l.spacing.letterSpacingEm, 0);
});

test("① 얇은 글씨: 정보 글자는 '주의' + 굵게 제안, 큰 글자는 통과, 예술은 '참고'", () => {
  const d = fresh();
  layer(d, 6).font.weightGuess = "light";
  layer(d, 2).font.weightGuess = "light"; // 220px 제목
  layer(d, 4).font.weightGuess = "light"; // 예술 부제
  const r = E.checkDocument(d, { medium: "flyer" });
  const w6 = of(r, 6, "weight")[0];
  assert.equal(w6.status, "warn");
  assert.equal(w6.fix.type, "weight");
  assert.equal(of(r, 2, "weight")[0].status, "pass");
  const w4 = of(r, 4, "weight")[0];
  assert.equal(w4.status, "advisory");
  assert.equal(w4.fix, null);
  assert.equal(of(r, 8, "weight").length, 0, "보통 굵기는 결과를 만들지 않아요");
  assert.ok(E.toApplyFixes(r).some((f) => f.layerId === 6 && f.type === "weight" && f.fauxBold));
});

test("① 글꼴 이름으로 얇은 글꼴을 알아본다", () => {
  const LD = require("../plugin/lib/layer-data.js");
  const make = (fontName) => LD.buildTextLayer({ id: 1, docKey: "a", text: "가", fontName, sizePx: 30, ppi: 72 }).font.weightGuess;
  assert.equal(make("NotoSansKR-Light"), "light");
  assert.equal(make("Pretendard-Thin"), "light");
  assert.equal(make("NanumSquareExtraLight"), "light");
  assert.equal(make("MalgunGothic"), "regular");
});

test("④ 텍스트 간격: 여러 줄 정보 글자의 줄 간격 1.5배 미만, 좁은 자간은 '주의' + 수정 제안", () => {
  const d = fresh();
  Object.assign(layer(d, 9).spacing, { lineCount: 3, lineHeightRatio: 1.2 });
  layer(d, 10).spacing.letterSpacingEm = -0.08;
  const r = E.checkDocument(d, { medium: "flyer" });
  const s9 = of(r, 9, "spacing")[0];
  assert.equal(s9.status, "warn");
  assert.equal(s9.fix.lineHeight, 1.5);
  const s10 = of(r, 10, "spacing")[0];
  assert.equal(s10.status, "warn");
  assert.equal(s10.fix.letterSpacingEm, 0);
  assert.equal(of(r, 6, "spacing").length, 0, "한 줄이고 자간이 괜찮으면 결과 없음");
  const fx = E.toApplyFixes(r).filter((f) => f.type === "spacing");
  assert.deepEqual(fx.map((f) => f.layerId).sort(), [10, 9]);
});

test("④ 자간 기준 -0.05em(포토샵 -50): 살짝 좁힌 자간은 넘기고, 더 좁을 때만 잡아서 0으로 고쳐요", () => {
  const at = (em) => {
    const d = fresh();
    layer(d, 10).spacing.letterSpacingEm = em;
    return of(E.checkDocument(d, { medium: "flyer" }), 10, "spacing")[0];
  };
  assert.equal(at(-0.02), undefined, "-20 은 흔한 자간이라 결과 없음");
  assert.equal(at(-0.05), undefined, "-50 까지는 괜찮아요");
  const r = at(-0.06);
  assert.equal(r.status, "warn");
  assert.match(r.metric, /자간 -0.06em \(기준 -0.05em 이상\)/);
  assert.equal(r.fix.letterSpacingEm, 0, "고칠 때는 기본 간격으로");
});

test("④ 여러 줄이어도 줄 간격이 넉넉하면 통과, 예술 글자는 '참고'", () => {
  const d = fresh();
  Object.assign(layer(d, 9).spacing, { lineCount: 2, lineHeightRatio: 1.6 });
  Object.assign(layer(d, 4).spacing, { lineCount: 2, lineHeightRatio: 1.0 });
  const r = E.checkDocument(d, { medium: "flyer" });
  assert.equal(of(r, 9, "spacing")[0].status, "pass");
  assert.equal(of(r, 4, "spacing")[0].status, "advisory");
  assert.equal(of(r, 4, "spacing")[0].fix, null);
});

test("③ 추천 크기로 키웠을 때 다른 글자와 겹치면 '주의'와 겹치지 않는 최대 크기를 알려준다", () => {
  const d = fresh();
  move(layer(d, 8), 0, -50); // 장소를 일시 바로 아래로 (지금은 안 겹침)
  const r = E.checkDocument(d, { medium: "wall" });
  const lay = r.results.filter((x) => x.check === "layout" && x.status === "warn" && (x.layerId === 6 || x.layerId === 8));
  assert.ok(lay.length > 0);
  const x = lay[0];
  assert.ok(x.detail.overlapsWith.length > 0);
  const size = of(r, x.layerId, "size")[0];
  assert.ok(size.fix.layoutWarning);
  if (x.detail.maxFitPt) assert.ok(x.detail.maxFitPt < size.fix.valuePt);
});

test("③ 촘촘한 줄이 함께 커져야 하면, 서로 실제로 키울 크기를 기준으로 겹치지 않는 최대 크기를 나눠 가진다", () => {
  // 저시력(0.3) 2m: 아래쪽 일시·장소·가격·접근성 안내는 모두 69pt가 필요해서 서로 겹쳐요
  const r = E.checkDocument(fresh(), { medium: "wall", distanceM: 2, viewer: "low" });
  const fits = [6, 8, 9, 10].map((id) => {
    const x = of(r, id, "layout")[0];
    assert.ok(x && x.status === "warn", "id " + id + " 겹침 주의");
    return { id, pt: x.detail.maxFitPt, now: layer(fresh(), id).sizePt };
  });
  // 모두 지금보다 1.5배 넘게 키울 수 있어요 (예전에는 이웃의 69pt 상자에 막혀 거의 못 키웠어요)
  fits.forEach((f) => assert.ok(f.pt && f.pt > f.now * 1.5, JSON.stringify(f)));
});

test("③ 키우면 포스터 밖으로 나가는 글자를 찾는다", () => {
  const d = fresh();
  const l = layer(d, 9);
  move(l, 1700 - l.bounds.right, 0); // 오른쪽 끝에 붙이기
  const r = E.checkDocument(d, { medium: "wall" });
  const x = of(r, 9, "layout")[0];
  assert.equal(x.status, "warn");
  assert.ok(x.detail.overflow.right > 0);
});

test("③ 원본 샘플은 추천 크기로 키워도 잘리거나 겹치지 않는다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  const lay = r.results.filter((x) => x.check === "layout");
  assert.ok(lay.length > 0);
  assert.ok(lay.every((x) => x.status === "pass"), lay.map((x) => x.metric).join("\n"));
});

test("③ 지금 이미 겹쳐 있는 글자도 알려준다", () => {
  const d = fresh();
  const a = layer(d, 10), b = layer(d, 11);
  move(b, a.bounds.left - b.bounds.left, a.bounds.top - b.bounds.top + 5);
  const r = E.checkDocument(d, { medium: "flyer" });
  const x = r.results.find((y) => y.check === "layout" && y.status !== "pass" && /지금/.test(y.metric));
  assert.ok(x, "겹침 결과가 있어야 해요");
});

test("⑤ 일시와 장소가 멀리 떨어져 있으면 '주의'", () => {
  const near = E.checkDocument(fresh(), { medium: "flyer" }).results.find((x) => x.check === "hierarchy" && x.detail.pair);
  assert.equal(near.status, "pass");
  const d = fresh();
  move(layer(d, 8), 0, 700);
  const far = E.checkDocument(d, { medium: "flyer" }).results.find((x) => x.check === "hierarchy" && x.detail.pair);
  assert.equal(far.status, "warn");
  assert.ok(far.detail.gapRatio > 0.12);
});

test("⑤ 제목이 본문과 비슷한 크기면 구별되지 않는다고 알려준다", () => {
  const d = fresh();
  d.layers.forEach((l) => (l.sizePt = 20));
  layer(d, 2).sizePt = 25; // 제목이 본문의 1.25배
  const r = E.checkDocument(d, { medium: "flyer" });
  const h = r.results.find((x) => x.check === "hierarchy" && x.detail.titleRatio != null);
  assert.equal(h.layerId, 2);
  assert.equal(h.status, "warn");
});

test("⑤ 위아래 글자 묶음이 너무 붙어 있으면 '밀집'을 알려준다", () => {
  const d = fresh();
  const a = layer(d, 8), b = layer(d, 9);
  move(b, 0, a.bounds.bottom + 2 - b.bounds.top);
  const r = E.checkDocument(d, { medium: "flyer" });
  const x = r.results.find((y) => y.check === "hierarchy" && y.detail.crowdedWith === 8 && y.layerId === 9);
  assert.ok(x);
  assert.equal(x.status, "warn");
});

test("⑤ 예술 문서에서는 계층 문제도 '참고'로만", () => {
  const d = fresh();
  d.document.purpose = "art";
  move(layer(d, 8), 0, 700);
  const far = E.checkDocument(d, { medium: "flyer" }).results.find((x) => x.check === "hierarchy" && x.detail.pair);
  assert.equal(far.status, "advisory");
});

test("A 수정: 굵게·간격을 PSD에 넣고, 다시 읽어도 남아 있다", () => {
  const out = applyFixes(psd, [
    { layerId: 6, type: "weight", fauxBold: true },
    { layerId: 9, type: "spacing", lineHeight: 1.5, letterSpacingEm: 0.05 }
  ]);
  assert.equal(out.skipped.length, 0, JSON.stringify(out.skipped));
  const before = findLayer(psd.children, 6).layer, after = findLayer(out.psd.children, 6).layer;
  assert.ok(after.imageData.width > before.imageData.width, "미리보기 글자가 두꺼워져요");
  assert.ok(out.warnings.some((w) => /줄 간격·자간/.test(w)));

  const back = agPsd.readPsd(agPsd.writePsdBuffer(out.psd, WRITE_OPTIONS), { useImageData: true });
  assert.equal(findLayer(back.children, 6).layer.text.style.fauxBold, true);
  const d = extractFromPsd(back, { fileName: "after.psd" });
  assert.equal(layer(d, 6).font.weightGuess, "bold");
  assert.equal(layer(d, 9).spacing.lineHeightRatio, 1.5);
  assert.equal(layer(d, 9).spacing.letterSpacingEm, 0.05);
});

test("A 수정: 글자를 키워서 포스터 밖으로 나가면 경고한다", () => {
  const out = applyFixes(psd, [{ layerId: 9, type: "size", valuePt: 60 }]);
  assert.ok(out.warnings.some((w) => /포스터 밖/.test(w)), out.warnings.join("\n"));
});

test("검사 → 굵게·간격 수정 적용 → 다시 검사하면 해당 '주의'가 사라진다", () => {
  // 원본 PSD를 얇은 글꼴·좁은 자간으로 바꿔 놓고 시작
  const src = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
  const t6 = findLayer(src.children, 6).layer.text;
  t6.style.font = { name: "NotoSansKR-Light" };
  const t10 = findLayer(src.children, 10).layer.text;
  t10.style.tracking = -80; // 기준 -50 보다 좁게
  const d = extractFromPsd(src, { fileName: "thin.psd" });
  const r = E.checkDocument(d, { medium: "flyer" });
  assert.equal(of(r, 6, "weight")[0].status, "warn");
  assert.equal(of(r, 10, "spacing")[0].status, "warn");

  const fixes = E.toApplyFixes(r).filter((f) => f.type === "weight" || f.type === "spacing");
  const out = applyFixes(src, fixes);
  const back = agPsd.readPsd(agPsd.writePsdBuffer(out.psd, WRITE_OPTIONS), { useImageData: true });
  const again = E.checkDocument(extractFromPsd(back, { fileName: "after.psd" }), { medium: "flyer" });
  assert.equal(of(again, 6, "weight").length, 0);
  assert.equal(of(again, 10, "spacing").length, 0);
});

test("③ 키우면 겹치는 크기 수정은 '모두 적용' 기본 목록에서 빠지고, 옵션으로 넣을 수 있다", () => {
  const d = fresh();
  move(layer(d, 8), 0, -50); // 장소를 일시 바로 아래로 → 둘 다 키우면 겹쳐요
  const r = E.checkDocument(d, { medium: "wall" });
  const warned = r.results.filter((x) => x.check === "size" && x.fix && x.fix.layoutWarning).map((x) => x.layerId);
  assert.ok(warned.length > 0);
  const def = E.toApplyFixes(r).filter((f) => f.type === "size").map((f) => f.layerId);
  for (const id of warned) assert.ok(!def.includes(id), `겹치는 레이어 ${id}는 기본에서 빠져요`);
  assert.ok(def.length > 0, "겹치지 않는 크기 수정은 그대로");
  const all = E.toApplyFixes(r, { includeLayoutConflicts: true }).filter((f) => f.type === "size").map((f) => f.layerId);
  for (const id of warned) assert.ok(all.includes(id));
});
