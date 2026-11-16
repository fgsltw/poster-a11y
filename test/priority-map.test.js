// 정보 전달 지도 (검토 우선순위): 중요도 × (1 − 식별 쉬움)
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const P = require("../engine/policies.js");
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
const of = (r, id) => r.priority.find((x) => x.layerId === id);

// 샘플: 2 제목 · 4 영문 부제 · 5 그림 위 일정 · 6 일시 · 8 장소 · 9 가격 · 10 접근성 · 11 주최·후원

test("공연명은 크고 잘 보여서 우선순위가 낮고, 배경에 묻힌 일시는 높다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  assert.equal(of(r, 2).level, "low");
  assert.equal(of(r, 2).legibility, 1);
  assert.equal(of(r, 5).level, "high", "그림 위 일정");
  assert.equal(of(r, 5).weakest, "contrast");
  assert.equal(of(r, 6).level, "high", "작고 대비가 낮은 일시");
  assert.equal(r.priority[0].layerId, 5, "가장 먼저 볼 곳");
});

test("점수 = 중요도 × (1 − min(크기, 대비) × 위치)", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  for (const x of r.priority) {
    const L = Math.min(x.parts.size, x.parts.contrast) * x.parts.position;
    assert.ok(Math.abs(x.score - x.importance * (1 - L)) < 0.01, `${x.text}: ${x.score}`);
    assert.ok(x.score >= 0 && x.score <= 1);
  }
  // 정렬: 높은 점수부터
  const scores = r.priority.map((x) => x.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test("중요도는 역할로: 일시·장소가 가장 높고, 주최·후원(그 외)은 낮다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  assert.equal(of(r, 8).importance, P.priorityMap.importance.place);
  assert.equal(of(r, 11).importance, P.priorityMap.importance.other);
  assert.ok(of(r, 11).importance < of(r, 6).importance);
});

test("가장자리에 붙은 글자는 위치 점수가 낮아진다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  assert.equal(of(r, 11).parts.atEdge, true, "맨 아래 주최·후원");
  assert.equal(of(r, 11).parts.position, P.priorityMap.edgeFactor);
  assert.equal(of(r, 6).parts.atEdge, false);
});

test("저시력 기준으로 보면 우선순위가 높은 곳이 늘어난다", () => {
  const high = (viewer) => E.checkDocument(fresh(), { medium: "wall", viewer }).priority.filter((x) => x.level === "high").length;
  assert.ok(high("low") > high("general"), `${high("general")} → ${high("low")}`);
});

test("고친 뒤 다시 보면 우선순위가 낮아진다 (그림 위 일정은 충돌이라 남아요)", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  const out = applyFixes(psd, E.toApplyFixes(r));
  const again = E.checkDocument(extractFromPsd(agPsd.readPsd(agPsd.writePsdBuffer(out.psd, WRITE_OPTIONS), { useImageData: true }), { fileName: "after.psd" }), { medium: "wall" });
  for (const id of [6, 8, 9, 10]) assert.equal(of(again, id).level, "low", `레이어 ${id}`);
  assert.equal(of(again, 5).level, "high");
});
