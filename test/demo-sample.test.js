// 시연용 샘플(tools/make-demo-psd.js): 고치기 전에는 문제가 많고, '자동으로 모두 고치기' 뒤에는 '고쳐야 함'이 없어야 해요
//   PSD 파일 없이 만든 PSD 객체로 바로 검사해요 (ag-psd 쓰기·읽기는 다른 테스트가 확인)
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine/engine.js");
const PS = require("../plugin/lib/purpose-store.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const { applyFixes } = require("../src/psd-apply.js");
const { build } = require("../tools/make-demo-psd.js");

// 시작 화면의 '샘플 포스터로 해보기'와 같은 설정: SNS · 정보 전달 · 저시력 0.3 · 좁은 시야 · 색각이상 확인
const ENV = { medium: "sns", lighting: "normal", viewer: "low", field: "narrow", colorVision: true };

function check(psd) {
  const doc = extractFromPsd(psd, { fileName: "sample-demo.psd" });
  const info = PS.empty();
  info.document = "info";
  PS.applyToDocument(doc, info);
  return { doc, result: E.checkDocument(doc, ENV) };
}
const count = (r, status) => r.results.filter((x) => x.status === status).length;

// 웹의 autoFixPlan 과 같아요: 엔진 추천 수정 + 키우면 겹치는 글자는 '겹치지 않는 최대 크기'까지만
function autoFixes(result, doc) {
  const fixes = E.toApplyFixes(result);
  const has = new Set(fixes.map((f) => f.layerId + ":" + f.type));
  result.results.forEach((r) => {
    if (r.check !== "size" || !r.fix || !r.fix.layoutWarning || r.status === "advisory" || r.status === "pass") return;
    const l = doc.layers.find((x) => x.id === r.layerId), fit = r.fix.maxFitPt;
    if (!l || !fit || fit <= (l.sizePt || 0) + 0.25 || has.has(r.layerId + ":size")) return;
    fixes.push({ layerId: r.layerId, type: "size", valuePt: fit, reason: r.metric });
  });
  return fixes;
}

test("고치기 전: 대비·크기 '고쳐야 함'이 많고, 얇은 글씨·좁은 자간·줄 간격·색만 다른 강조도 있어요", () => {
  const { psd } = build();
  const { result } = check(psd);
  assert.ok(count(result, "fail") >= 8, `fail ${count(result, "fail")}`);
  const checks = new Set(result.results.filter((x) => x.status !== "pass").map((x) => x.check));
  for (const c of ["contrast", "size", "weight", "spacing", "colorOnly"]) assert.ok(checks.has(c), c + " 문제가 있어야 해요");
});

test("자동으로 모두 고치면 '고쳐야 함'이 0개이고, 제목은 그대로예요", () => {
  const { psd } = build();
  const { doc, result } = check(psd);
  const fixes = autoFixes(result, doc);
  const types = new Set(fixes.map((f) => f.type));
  for (const t of ["color", "size", "weight", "spacing", "emphasis"]) assert.ok(types.has(t), t + " 수정이 있어야 해요");
  const title = doc.layers.find((l) => l.name === "제목");
  assert.ok(!fixes.some((f) => f.layerId === title.id), "제목은 고칠 게 없어야 해요");
  const after = check(applyFixes(psd, fixes).psd).result;
  assert.equal(count(after, "fail"), 0);
});
