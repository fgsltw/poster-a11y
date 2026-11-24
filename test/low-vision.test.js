// 저시력자 특화: 보는 사람 시력 단계, 글꼴 가독성, 백내장 시뮬레이션, 큰 글씨 안내문
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const P = require("../engine/policies.js");
const R = require("../engine/roles.js");
const LP = require("../src/large-print.js");
const Sim = require("../src/simulate.js");
const { extractFromPsd } = require("../src/psd-extract.js");

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

// ---------------------------------------------------------------- 보는 사람 시력 단계
test("시력 단계는 조사한 기준값이에요 (WHO 0.3, 한국 시각장애 0.2·0.06)", () => {
  assert.equal(P.viewers.low.acuity, 0.3);
  assert.equal(P.viewers.disability.acuity, 0.2);
  assert.equal(P.viewers.severe.acuity, 0.06);
  assert.equal(P.lowVisionReading.acuityReserve, 2);
});

test("저시력일수록 글자 크기 기준이 커진다: 겨우 보이는 크기(5′÷시력) × 2", () => {
  const at = (viewer) => find(E.checkDocument(fresh(), { medium: "wall", viewer }), 6, "size").detail;
  const g = at("general"), low = at("low"), dis = at("disability");
  assert.equal(g.passArcmin, 15);
  assert.ok(Math.abs(low.passArcmin - (5 / 0.3) * 2) < 0.01, String(low.passArcmin));
  assert.equal(dis.passArcmin, 50);
  assert.ok(g.recommendedPt < low.recommendedPt && low.recommendedPt < dis.recommendedPt);
});

test("저시력이면 정보 글자 대비 기준이 7:1(WCAG AAA), 예술 글자는 그대로", () => {
  const r = E.checkDocument(fresh(), { medium: "wall", viewer: "low" });
  assert.equal(find(r, 9, "contrast").detail.target, 7);
  assert.match(find(r, 9, "contrast").metric, /저시력 기준/);
  assert.equal(find(r, 2, "contrast").detail.target, 3);
  assert.equal(find(E.checkDocument(fresh(), { medium: "wall" }), 9, "contrast").detail.target, 4.5);
});

test("심한 시각장애(0.06)는 필요한 글자가 포스터에 비해 너무 커서 큰 글씨 안내문을 권한다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall", viewer: "severe" });
  const s = find(r, 6, "size");
  assert.equal(s.detail.tooBig, true);
  assert.equal(s.fix, null, "글자 키우기 대신");
  assert.equal(s.alternative.type, "largePrint");
  assert.match(s.message, /큰 글씨 안내문/);
  assert.equal(r.summary.largePrintRecommended, true);
  assert.equal(E.checkDocument(fresh(), { medium: "wall" }).summary.largePrintRecommended, false);
});

test("모르는 보는 사람 값이면 일반 시력으로 검사한다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall", viewer: "nope" });
  assert.equal(r.environment.viewer, "general");
  assert.equal(r.environment.acuity, null);
});

// ---------------------------------------------------------------- 글꼴 가독성
test("글꼴 가독성: 장식·좁은 글꼴, 기울임, 영문 전부 대문자를 찾는다", () => {
  const d = fresh();
  const l = (id) => d.layers.find((x) => x.id === id);
  l(6).font.name = l(6).font.postScriptName = "NanumBrush";
  l(8).font.name = l(8).font.postScriptName = "Roboto-Condensed";
  l(9).font.fauxItalic = true;
  const r = E.checkDocument(d, { medium: "flyer" });
  assert.deepEqual(find(r, 6, "font").detail.issues, ["decorative"]);
  assert.deepEqual(find(r, 8, "font").detail.issues, ["condensed"]);
  assert.deepEqual(find(r, 9, "font").detail.issues, ["italic"]);
  assert.equal(find(r, 6, "font").status, "warn");
  // 샘플의 영문 부제 "THE RITE OF SPRING" 은 예술 글자라 '참고'
  const sub = find(r, 4, "font");
  assert.deepEqual(sub.detail.issues, ["allCaps"]);
  assert.equal(sub.status, "advisory");
  assert.equal(find(r, 10, "font"), undefined, "문제가 없으면 결과를 만들지 않아요");
});

test("글꼴 이름 일부가 겹쳐도 잘못 잡지 않는다 (OpenSans 는 장식 글꼴이 아님)", () => {
  const d = fresh();
  const l = d.layers.find((x) => x.id === 6);
  l.font.name = l.font.postScriptName = "OpenSans-Regular";
  assert.equal(find(E.checkDocument(d, { medium: "flyer" }), 6, "font"), undefined);
});

test("PSD의 기울임·대문자 설정을 레이어 데이터로 읽는다 (v0.4)", () => {
  const src = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
  const find2 = (list, id) => { for (const x of list) { if (x.id === id) return x; if (x.children) { const r = find2(x.children, id); if (r) return r; } } };
  find2(src.children, 9).text.style.fauxItalic = true;
  find2(src.children, 10).text.style.fontCaps = 2;
  const back = agPsd.readPsd(agPsd.writePsdBuffer(src, { invalidateTextLayers: true }), { useImageData: true });
  const d = extractFromPsd(back, { fileName: "a.psd" });
  assert.equal(d.layers.find((x) => x.id === 9).font.fauxItalic, true);
  assert.equal(d.layers.find((x) => x.id === 10).font.caps, "all");
});

// ---------------------------------------------------------------- 백내장 시뮬레이션
test("백내장: 누렇게 보이기는 파란빛을 가장 많이 줄인다", () => {
  const img = { width: 1, height: 1, data: new Uint8ClampedArray([200, 200, 200, 255]) };
  Sim.applyYellowing(img, 1);
  const [r, g, b] = img.data;
  assert.equal(r, 200);
  assert.ok(g < 200 && b < g, `${r},${g},${b}`);
  const out = Sim.simulate({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) }, { yellowing: 0.5 });
  assert.ok(out.description.includes("누렇게 보임"));
});

// ---------------------------------------------------------------- 큰 글씨 안내문
test("안내문 기본 글: 제목, 일시(읽기 쉬운 말), 장소, 가격, 접근성. 주최·후원은 빼요", () => {
  const d = fresh();
  const r = E.checkDocument(d, { medium: "wall" });
  const text = LP.draftText(d.layers, r.roles, R.speakDate);
  const lines = text.split("\n");
  assert.equal(lines[0], "봄의 제전");
  assert.match(text, /일시: .*11월 8일 토요일 저녁 7시 30분/);
  assert.match(text, /장소: 예술의전당 오페라극장 3층/);
  assert.match(text, /가격·예매: R석 70,000원, S석 50,000원, 예매 필수/);
  assert.match(text, /접근성: 음성해설, 수어통역, 휠체어석 운영/);
  assert.doesNotMatch(text, /주최/);
});

test("안내문 배치: 폭에 맞게 줄을 나누고, 넘치면 다음 쪽으로, 본문은 24pt 이상", () => {
  const measure = (t, size) => t.length * size * 0.9; // 글자 하나 = 글자 크기의 0.9배라고 가정
  const bodyPx = Math.round((32 * 300) / 72); // 32pt @300ppi
  assert.ok(bodyPx >= (24 * 300) / 72);
  const long = "제목\n" + Array.from({ length: 30 }, (_, i) => `항목${i}: ` + "아주 긴 설명이 이어지는 문장 ".repeat(3)).join("\n");
  const out = LP.layout(long, { pageWidthPx: 2480, pageHeightPx: 3508, marginPx: 200, bodyPx, measure });
  assert.ok(out.pages.length > 1, "여러 쪽");
  for (const pg of out.pages) for (const it of pg) {
    if (it.kind === "rule") continue;
    assert.ok(measure(it.text, it.sizePx) <= 2480 - 400 + 1, `넘침: ${it.text}`);
    assert.ok(it.y + it.sizePx <= 3508 - 200 + it.sizePx * 0.6, `아래로 넘침 y=${it.y}`);
  }
  assert.equal(out.pages[0][0].kind, "title");
  assert.ok(out.labelPx >= (24 * 300) / 72, "라벨도 24pt 이상");
});

test("PDF: JPEG 쪽들을 A4 PDF로 묶고, 위치표(xref)가 맞는다", () => {
  const { createCanvas } = require("@napi-rs/canvas");
  const jpg = (color) => {
    const c = createCanvas(124, 175);
    const g = c.getContext("2d");
    g.fillStyle = color; g.fillRect(0, 0, 124, 175);
    return new Uint8Array(c.toBuffer("image/jpeg"));
  };
  const pages = [jpg("#000"), jpg("#ff0")];
  assert.deepEqual(LP.jpegSize(pages[0]), { width: 124, height: 175 });
  const pdf = LP.pdfFromJpegs(pages, { title: "봄의 제전 안내문" });
  const text = Buffer.from(pdf).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /\/Count 2/);
  assert.equal((text.match(/\/Subtype \/Image/g) || []).length, 2);
  assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  // xref 의 위치가 실제 'n 0 obj' 위치와 같아야 PDF 뷰어가 열 수 있어요
  const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
  const rows = text.slice(startxref).split("\n").slice(3).filter((s) => / 00000 n $/.test(s));
  rows.forEach((row, i) => {
    const off = Number(row.slice(0, 10));
    assert.equal(text.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `객체 ${i + 1}`);
  });
});

// ---------------------------------------------------------------- 시야가 좁은 사람 (근접성)
test("시야 단계는 장애정도 판정기준의 10°·5°예요", () => {
  assert.equal(P.visualField.levels.narrow.deg, 10);
  assert.equal(P.visualField.levels.veryNarrow.deg, 5);
});

test("보통 시야면 시야 검사를 하지 않는다", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  assert.equal(r.results.filter((x) => x.check === "field").length, 0);
});

test("벽 포스터 2m에서는 핵심 정보가 한눈에 들어오고, 전단 40cm·5°에서는 여러 군데로 흩어진다", () => {
  const wall = E.checkDocument(fresh(), { medium: "wall", field: "narrow" }).results.find((x) => x.check === "field");
  assert.equal(wall.status, "pass");
  assert.equal(wall.detail.clusterCount, 1);
  // 2m에서 10° → 지름 2 × 2000 × tan(10°) ≈ 705mm
  assert.ok(Math.abs(wall.detail.viewMm - 705.3) < 1, String(wall.detail.viewMm));
  const flyer = E.checkDocument(fresh(), { medium: "flyer", field: "veryNarrow" }).results.find((x) => x.check === "field");
  assert.ok(flyer.detail.clusterCount >= 3);
  assert.equal(flyer.status, "fail");
  assert.match(flyer.message, /한곳에 모아/);
});

test("핵심 정보를 한곳에 모으면 묶음이 줄어든다", () => {
  const d = fresh();
  const far = E.checkDocument(d, { medium: "flyer", field: "narrow" }).results.find((x) => x.check === "field");
  // 일시·장소·가격·접근성을 장소 옆으로 바짝 모아요
  const base = d.layers.find((l) => l.id === 8).bounds;
  let y = base.top;
  for (const id of [5, 6, 8, 9, 10]) {
    const l = d.layers.find((x) => x.id === id);
    const h = 20;
    l.bounds = Object.assign({}, l.bounds, { left: base.left, right: base.left + 300, top: y, bottom: y + h, width: 300, height: h });
    y += h + 4;
  }
  const near = E.checkDocument(d, { medium: "flyer", field: "narrow" }).results.find((x) => x.check === "field");
  assert.ok(near.detail.clusterCount < far.detail.clusterCount || far.detail.clusterCount === 1, `${far.detail.clusterCount} → ${near.detail.clusterCount}`);
  assert.equal(near.status, "pass");
});

test("예술 문서에서는 시야 검사도 '참고'", () => {
  const d = fresh();
  d.document.purpose = "art";
  const x = E.checkDocument(d, { medium: "flyer", field: "veryNarrow" }).results.find((y) => y.check === "field");
  assert.equal(x.status, "advisory");
});
