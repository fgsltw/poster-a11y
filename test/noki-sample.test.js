// 대표 샘플 '노키' (samples/sample-noki.psd): 홈 비교 그림과 '샘플로 해보기'에 써요.
//   팀 포스터(글자가 그림으로 바뀐 PSD)에 텍스트 정보를 붙인 파일이에요 (tools/make-noki-psd.js).
//   앱 기본 설정(SNS · 저시력 0.3 · 좁은 시야 · 색각이상)으로 검사·자동 수정이 빠짐없이 돼야 해요.
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const PurposeStore = require("../plugin/lib/purpose-store.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const { applyFixes } = require("../src/psd-apply.js");

agPsd.initializeCanvas(() => { throw new Error("no canvas"); }, (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));

const file = path.join(__dirname, "..", "samples", "sample-noki.psd");
const read = () => agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
const ENV = { medium: "sns", viewer: "low", field: "narrow", colorVision: true };
function check() {
  const doc = extractFromPsd(read(), { fileName: "sample-noki.psd" });
  const info = PurposeStore.empty();
  info.document = "info";
  PurposeStore.applyToDocument(doc, info);
  return { doc, r: E.checkDocument(doc, ENV) };
}

test("노키 샘플: 글자 레이어 13개를 글자로 읽고, 일시·장소·참가 정보를 알아봐요", () => {
  const { doc, r } = check();
  assert.equal(doc.layers.filter((l) => l.text).length, 13);
  const roles = Object.values(r.roles);
  ["title", "date", "place", "price"].forEach((x) => assert.ok(roles.includes(x), x));
});

test("노키 샘플: 자동 수정이 모두 들어가고 (레이어를 못 찾는 수정 없음), '무료'는 굵게·밑줄", () => {
  const { r } = check();
  const fixes = E.toApplyFixes(r);
  assert.ok(fixes.length >= 10);
  const out = applyFixes(read(), fixes);
  assert.deepEqual(out.skipped, []);
  const emph = r.results.find((x) => x.check === "colorOnly");
  assert.ok(emph && /무료/.test(emph.metric));
});
