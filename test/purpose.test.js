// 목적 정보(예술적 표현 / 정보 전달 / 복합)를 PSD 안에 저장하고 불러오는지 확인합니다.
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
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
const readSample = () => agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
const roundtrip = (psd, opts) => agPsd.readPsd(agPsd.writePsdBuffer(psd, opts), { useImageData: true });

// 샘플: 그룹 3 = 타이틀, 그룹 7 = 공연 정보, 레이어 5·11 은 그룹 밖
const INFO = { document: "mixed", groups: { 3: "art", 7: "info" }, layers: { 5: "info" } };

test("목적 정보가 없는 PSD는 모두 '아직 안 정함'", () => {
  const doc = extractFromPsd(readSample(), { fileName: "a.psd" });
  assert.equal(doc.document.purpose, null);
  assert.ok(doc.layers.every((l) => l.purpose === null && l.purposeSource === null));
});

test("저장 → 파일로 쓰기 → 다시 읽기", () => {
  const psd = PS.writeToPsd(readSample(), INFO);
  const back = roundtrip(psd);
  const info = PS.readFromPsd(back);
  assert.equal(info.document, "mixed");
  assert.deepEqual(info.groups, { 3: "art", 7: "info" });
  assert.deepEqual(info.layers, { 5: "info" });
  assert.ok(info.updatedAt);
});

test("복합 목적: 레이어 지정 > 가까운 그룹 > 아직 안 정함", () => {
  const doc = extractFromPsd(roundtrip(PS.writeToPsd(readSample(), INFO)), { fileName: "a.psd" });
  const byId = Object.fromEntries(doc.layers.map((l) => [l.id, l]));
  assert.deepEqual([byId[2].purpose, byId[2].purposeSource], ["art", "group"]); // 제목 (타이틀 그룹)
  assert.deepEqual([byId[6].purpose, byId[6].purposeSource], ["info", "group"]); // 일시 (공연 정보 그룹)
  assert.deepEqual([byId[5].purpose, byId[5].purposeSource], ["info", "layer"]); // 그림 위 일정 (직접 지정)
  assert.deepEqual([byId[11].purpose, byId[11].purposeSource], [null, null]); // 후원 (지정 없음)
  assert.equal(doc.groups.find((g) => g.id === 3).purpose, "art");
  assert.equal(doc.document.purpose, "mixed");
});

test("문서 목적이 하나면 모든 레이어가 그 목적을 따른다", () => {
  const doc = extractFromPsd(roundtrip(PS.writeToPsd(readSample(), { document: "info", layers: { 2: "art" } })), { fileName: "a.psd" });
  assert.ok(doc.layers.every((l) => l.purpose === "info" && l.purposeSource === "document"));
});

test("그룹 안의 그룹은 가장 가까운 그룹의 목적을 따른다", () => {
  const r = PS.resolve({ document: "mixed", groups: { 10: "art", 20: "info" } }, { id: 1, groupIds: [10, 20] });
  assert.deepEqual(r, { purpose: "info", source: "group" });
  const r2 = PS.resolve({ document: "mixed", groups: { 10: "art" } }, { id: 1, groupIds: [10, 20] });
  assert.deepEqual(r2, { purpose: "art", source: "group" });
});

test("잘못된 값은 버린다", () => {
  const n = PS.normalize({ document: "fancy", groups: { 3: "mixed", x: "art" }, layers: { 5: "info", 6: 1 } });
  assert.deepEqual(n.groups, {});
  assert.deepEqual(n.layers, { 5: "info" });
  assert.equal(n.document, null);
});

test("다른 XMP 정보는 지우지 않고, 다시 저장해도 한 번만 들어간다", () => {
  const xmp =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>디자이너</dc:creator></rdf:Description>' +
    "</rdf:RDF></x:xmpmeta>";
  const once = PS.mergeIntoXmp(xmp, { document: "art" });
  const twice = PS.mergeIntoXmp(once, { document: "info" });
  assert.ok(twice.includes("<dc:creator>디자이너</dc:creator>"));
  assert.equal(twice.split("<pa11y:purposes>").length - 1, 1);
  assert.equal(PS.parseXmp(twice).document, "info");
});

test("특수문자가 들어가도 XML이 깨지지 않는다", () => {
  const xmp = PS.mergeIntoXmp(null, { document: "mixed", layers: { 1: "art" } });
  assert.ok(!/<pa11y:purposes>[^<]*"/.test(xmp), "따옴표는 이스케이프돼야 해요");
  assert.equal(PS.parseXmp(xmp).layers["1"], "art");
});

test("접근성 버전 PSD에도 목적 정보가 그대로 남는다", () => {
  const r = applyFixes(PS.writeToPsd(readSample(), INFO), [{ layerId: 6, type: "color", value: "#524D42" }]);
  const doc = extractFromPsd(roundtrip(r.psd, WRITE_OPTIONS), { fileName: "b.psd" });
  assert.equal(doc.document.purpose, "mixed");
  assert.equal(doc.layers.find((l) => l.id === 6).purpose, "info");
});
