// 검사 엔진(B)이 목적에 따라 다르게 판정하고 고치는 방법을 제안하는지 확인합니다.
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const P = require("../engine/policies.js");
const C = require("../engine/color.js");
const R = require("../engine/roles.js");
const PS = require("../plugin/lib/purpose-store.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const { applyFixes, WRITE_OPTIONS } = require("../src/psd-apply.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const file = path.join(__dirname, "..", "samples", "sample-poster.psd");
const psd = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
const fresh = () => extractFromPsd(psd, { fileName: "sample-poster.psd" });
const find = (r, id, check) => r.results.find((x) => x.layerId === id && x.check === check);

// 샘플 레이어: 2 제목 · 4 영문 부제 · 5 그림 위 일정 · 6 일시 · 8 장소 · 9 가격 · 10 접근성 · 11 후원

test("역할 분류: 제목·일시·장소·가격·접근성", () => {
  const roles = R.classify(fresh().layers);
  assert.equal(roles[2].role, "title");
  assert.equal(roles[6].role, "date");
  assert.equal(roles[8].role, "place");
  assert.equal(roles[9].role, "price");
  assert.equal(roles[10].role, "access");
  assert.equal(roles[11].role, "other");
});

test("날짜를 소리 내어 읽는 문장으로 바꾼다", () => {
  assert.equal(R.speakDate("11.8(토) 19:30"), "11월 8일 토요일 저녁 7시 30분");
  assert.equal(R.speakDate("3.2(월) 14:00"), "3월 2일 월요일 오후 2시");
});

test("목적 추천: 제목과 같은 그룹은 예술, 공연 정보는 정보 → 문서는 복합", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  assert.equal(r.document.purposeSuggested, "mixed");
  assert.equal(find(r, 2, "size").purpose, "art");
  assert.equal(find(r, 4, "size").purpose, "art");
  assert.equal(find(r, 6, "size").purpose, "info");
  assert.equal(find(r, 6, "size").purposeSource, "suggested");
});

test("정보 글자 대비 실패: 같은 색상에서 밝기만 바꾼 추천색으로 4.5:1을 넘긴다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  const c = find(r, 6, "contrast");
  assert.equal(c.status, "fail");
  assert.equal(c.fix.type, "color");
  assert.ok(c.fix.passes && c.fix.contrastAfter >= 4.5);
  const before = C.rgbToOklch(C.hexToRgb("#8A8478")), after = C.rgbToOklch(C.hexToRgb(c.fix.value));
  assert.ok(Math.abs(before.h - after.h) < 0.15, "색상(hue)은 거의 그대로");
  assert.ok(after.L < before.L, "밝은 배경이라 더 어둡게");
});

test("복합 목적: 그림 위 정보 글자는 '충돌'과 대체텍스트를 제안하고, 배경 띠로 그림을 가리지 않는다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  const c = find(r, 5, "contrast");
  assert.equal(c.status, "conflict");
  assert.equal(c.fix.passes, false);
  assert.notEqual(c.fix.type, "backplate");
  assert.match(c.alternative.draft, /봄의 제전/);
  assert.match(c.alternative.draft, /11월 8일 토요일 저녁 7시 30분/);
  assert.equal(r.summary.alternativeRecommended, true);
});

test("예술 요소는 기준 미달이어도 '실패' 대신 '참고'", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  const sub = r.results.filter((x) => x.layerId === 4);
  assert.ok(sub.every((x) => x.status === "advisory" || x.status === "pass"));
  assert.equal(find(r, 4, "size").fix, null, "예술 글자는 크기 수정 제안 없음");
});

test("문서 전체가 예술이면 '모두 적용' 없음, 실패 없음", () => {
  const d = fresh();
  d.document.purpose = "art";
  const r = E.checkDocument(d, { medium: "wall" });
  assert.equal(r.summary.applyAllAllowed, false);
  assert.ok(r.results.filter((x) => x.layerId != null).every((x) => x.status !== "fail" && x.status !== "conflict"));
});

test("문서 전체가 정보 전달이면 그림 위 글자에 배경 띠를 제안해서 통과시킨다", () => {
  const d = fresh();
  d.document.purpose = "info";
  const c = find(E.checkDocument(d, { medium: "wall" }), 5, "contrast");
  assert.equal(c.status, "fail");
  assert.equal(c.fix.type, "backplate");
  assert.ok(c.fix.passes);
});

test("어두운 조명이면 정보 글자의 대비 기준이 7:1로 올라간다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall", lighting: "dim" });
  assert.equal(find(r, 9, "contrast").detail.target, 7);
  assert.equal(find(r, 9, "contrast").status, "fail"); // 보통 조명에선 통과(5.1:1)
  assert.equal(find(r, 2, "contrast").detail.target, 3, "예술 글자는 그대로");
});

test("관람 거리: 벽 포스터(2m)보다 전단(40cm)에서 크기 통과가 많다", () => {
  const wall = E.checkDocument(fresh(), { medium: "wall" }).results.filter((x) => x.check === "size" && x.status === "pass").length;
  const flyer = E.checkDocument(fresh(), { medium: "flyer" }).results.filter((x) => x.check === "size" && x.status === "pass").length;
  assert.ok(flyer > wall, `${wall} → ${flyer}`);
  const s = find(E.checkDocument(fresh(), { medium: "wall", distanceM: 2 }), 6, "size");
  assert.ok(s.detail.recommendedPt > 13.9);
});

test("SNS는 휴대폰 화면에 보이는 크기로 계산한다", () => {
  const r = E.checkDocument(fresh(), { medium: "sns" });
  const s = find(r, 6, "size");
  // 1754px 를 65mm 화면에 → 29px 글자 × 0.8 ≈ 0.86mm
  assert.ok(Math.abs(s.detail.glyphMm - 29 * 0.8 * (65 / 1754)) < 0.05, String(s.detail.glyphMm));
});

test("핵심 정보가 없으면 위계 검사에서 '누락'으로 알려준다", () => {
  const d = fresh();
  d.layers = d.layers.filter((l) => !/극장|층/.test(l.text));
  const miss = E.checkDocument(d, { medium: "wall" }).results.find((x) => x.check === "hierarchy" && x.detail.missingRole === "place");
  assert.equal(miss.status, "fail");
});

test("디자이너가 PSD에 저장한 목적이 추천보다 우선한다", () => {
  const withPurpose = PS.writeToPsd(agPsd.readPsd(fs.readFileSync(file), { useImageData: true }), { document: "mixed", layers: { 11: "art" } });
  const d = extractFromPsd(withPurpose, { fileName: "a.psd" });
  const r = E.checkDocument(d, { medium: "wall" });
  assert.equal(find(r, 11, "size").purpose, "art");
  assert.equal(find(r, 11, "size").status, "advisory");
});

test("정책 파일만 바꿔도 판정이 바뀐다", () => {
  const loose = JSON.parse(JSON.stringify(P));
  loose.size.passArcmin = 4;
  loose.size.warnArcmin = 3;
  loose.size.secondaryPassArcmin = 3;
  const r = E.checkDocument(fresh(), { medium: "wall" }, loose);
  assert.ok(r.results.filter((x) => x.check === "size").every((x) => x.status === "pass"));
});

test("검사 → 수정 목록 → A의 수정 적용 → 다시 검사하면 대비 실패가 사라진다", () => {
  const r = E.checkDocument(fresh(), { medium: "flyer" });
  const fixes = E.toApplyFixes(r);
  assert.ok(fixes.length > 0);
  assert.ok(fixes.every((f) => f.layerId !== 4), "예술 '참고'는 기본으로 넣지 않아요");
  assert.ok(fixes.every((f) => !(f.layerId === 5 && f.type === "color")), "기준을 못 넘는 수정은 넣지 않아요");

  const applied = applyFixes(psd, fixes);
  assert.equal(applied.skipped.length, 0);
  const back = agPsd.readPsd(agPsd.writePsdBuffer(applied.psd, WRITE_OPTIONS), { useImageData: true });
  const again = E.checkDocument(extractFromPsd(back, { fileName: "after.psd" }), { medium: "flyer" });
  for (const id of [6, 11]) assert.equal(find(again, id, "contrast").status, "pass", `레이어 ${id}`);
  assert.equal(find(again, 11, "size").status, "pass");
});

// 같은 이미지를 다른 해상도(ppi)로 저장한 것처럼 바꿔요. 픽셀은 그대로, 인쇄 크기(sizePt)만 달라져요.
function withPpi(d, ppi) {
  d.document.ppi = ppi;
  d.layers.forEach((l) => (l.sizePt = Math.round(((l.sizePx * 72) / ppi) * 10) / 10));
  return d;
}

test("SNS는 '큰 글자'를 휴대폰 화면에 보이는 크기로 판단한다 (ppi와 상관없음)", () => {
  // 장소(44px)는 인쇄로는 21pt라 큰 글자지만, 휴대폰 화면(390px 너비)에서는 약 7pt예요
  const sns = find(E.checkDocument(fresh(), { medium: "sns" }), 8, "contrast");
  assert.equal(sns.detail.sizeBasis, "screen");
  assert.equal(sns.detail.large, false);
  assert.equal(sns.detail.target, 4.5);
  assert.ok(Math.abs(sns.detail.shownPt - (44 * (390 / 1754) * 3) / 4) < 0.1, String(sns.detail.shownPt));

  // 같은 이미지를 72ppi·300ppi로 저장해도 SNS 판정은 같아요
  for (const ppi of [72, 300]) {
    const r = find(E.checkDocument(withPpi(fresh(), ppi), { medium: "sns" }), 8, "contrast");
    assert.equal(r.detail.large, false, `${ppi}ppi`);
    assert.equal(r.detail.target, 4.5, `${ppi}ppi`);
  }

  // 아주 큰 제목(220px)은 휴대폰에서도 큰 글자예요
  assert.equal(find(E.checkDocument(fresh(), { medium: "sns" }), 2, "contrast").detail.large, true);
});

test("벽 포스터·전단은 지금처럼 인쇄 크기로 '큰 글자'를 판단한다", () => {
  for (const medium of ["wall", "flyer"]) {
    const c = find(E.checkDocument(fresh(), { medium }), 8, "contrast");
    assert.equal(c.detail.sizeBasis, "print", medium);
    assert.equal(c.detail.large, true, medium); // 44px ÷ 150ppi = 21pt
    assert.equal(c.detail.target, 3, medium);
  }
});

test("얇은 글꼴의 '충분히 큰 글자'도 SNS는 화면에 보이는 크기로 판단한다", () => {
  const d = fresh();
  d.layers.find((l) => l.id === 8).font.weightGuess = "light";
  d.layers.forEach((l) => { if (l.id === 8) l.sizePt = 40; }); // 인쇄로는 36pt 넘음
  const wall = E.checkDocument(JSON.parse(JSON.stringify(d)), { medium: "wall" }).results.find((x) => x.layerId === 8 && x.check === "weight");
  const sns = E.checkDocument(JSON.parse(JSON.stringify(d)), { medium: "sns" }).results.find((x) => x.layerId === 8 && x.check === "weight");
  assert.equal(wall.status, "pass");
  assert.notEqual(sns.status, "pass");
  assert.match(sns.metric, /화면에 보이는 크기/);
});

// 색·배경 띠를 거의 못 바꾸게 해서 '고쳐도 기준을 못 넘는' 상황을 만들어요
function weakFixPolicy() {
  const p = JSON.parse(JSON.stringify(P));
  p.purposes.info.fix.maxLightnessShift = 0.01;
  p.purposes.info.fix.backplateMaxOpacity = 0.01;
  return p;
}

test("충돌은 그림 위 정보 글자일 때만: 단색 배경 위 글자는 못 고쳐도 '실패'", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" }, weakFixPolicy());
  assert.equal(r.document.purpose, "mixed");
  const date = find(r, 6, "contrast"); // 일시: 단색 배경
  assert.equal(date.detail.complexity, "simple");
  assert.equal(date.fix.passes, false);
  assert.equal(date.status, "fail");
  assert.doesNotMatch(date.message, /그림|예술 이미지/);
  assert.match(date.message, /배경 띠만으로는/);

  const overArt = find(r, 5, "contrast"); // 그림 위 일정: 복잡한 그림 배경
  assert.equal(overArt.status, "conflict");
  assert.match(overArt.message, /예술 이미지 위/);
  assert.ok(overArt.alternative);
});

test("고쳐도 기준을 못 넘으면 '이 색으로 바꾸면 기준을 넘어요'라고 하지 않는다", () => {
  const d = fresh();
  d.document.purpose = "info";
  const c = find(E.checkDocument(d, { medium: "wall", lighting: "dim" }), 5, "contrast");
  assert.equal(c.status, "fail");
  assert.equal(c.fix.passes, false);
  assert.doesNotMatch(c.message, /기준을 넘어요/);
});
