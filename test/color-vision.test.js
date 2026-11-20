// 색 의존 정보 (WCAG 1.4.1) · 색각이상일 때 대비
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const C = require("../engine/color.js");
const { extractFromPsd } = require("../src/psd-extract.js");
const { findLayer } = require("../src/psd-apply.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const file = path.join(__dirname, "..", "samples", "sample-poster.psd");
const read = () => agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
const fresh = () => extractFromPsd(read(), { fileName: "sample-poster.psd" });
const find = (r, id, check) => r.results.find((x) => x.layerId === id && x.check === check);
const run = (text, color, extra) => Object.assign({ text, color, sizePx: 29, fontName: "MalgunGothic", bold: false, italic: false, underline: false }, extra || {});

test("색각이상 시뮬레이션: 빨강·초록은 녹색맹에게 거의 같은 색, 빨강·검정은 구분돼요", () => {
  const red = C.hexToRgb("#C8102E"), green = C.hexToRgb("#2E8B57"), black = C.hexToRgb("#222222");
  assert.ok(C.deltaE(red, green) > 0.2, "일반 눈");
  assert.ok(C.deltaE(C.simulateCvd(red, "deutan"), C.simulateCvd(green, "deutan")) < 0.08, "녹색맹");
  assert.ok(C.deltaE(C.simulateCvd(red, "deutan"), C.simulateCvd(black, "deutan")) > 0.2);
});

test("색만 다른 강조 + 색각이상이면 같아 보임 → 주의 (어느 색맹인지 알려줘요)", () => {
  const d = fresh();
  const l = d.layers.find((x) => x.id === 6);
  l.styleRuns = [run("11.8(토) ", "#C8102E"), run("19:30", "#2E8B57")];
  const x = find(E.checkDocument(d, { medium: "flyer" }), 6, "colorOnly");
  assert.equal(x.status, "warn");
  assert.ok(x.detail.lostFor.includes("deutan"));
  assert.match(x.metric, /녹색맹/);
  assert.match(x.message, /WCAG 1\.4\.1/);
});

test("색이 달라도 굵기·밑줄 같은 모양으로도 구분되면 문제 없음", () => {
  const d = fresh();
  const l = d.layers.find((x) => x.id === 6);
  l.styleRuns = [run("11.8(토) ", "#C8102E", { bold: true }), run("19:30", "#2E8B57")];
  assert.equal(find(E.checkDocument(d, { medium: "flyer" }), 6, "colorOnly"), undefined);
  l.styleRuns = [run("11.8(토) ", "#C8102E", { underline: true }), run("19:30", "#2E8B57")];
  assert.equal(find(E.checkDocument(d, { medium: "flyer" }), 6, "colorOnly"), undefined);
});

test("색만 다르지만 색각이상으로도 구분되면 '참고'로만", () => {
  const d = fresh();
  d.layers.find((x) => x.id === 6).styleRuns = [run("11.8(토) ", "#C8102E"), run("19:30", "#222222")];
  const x = find(E.checkDocument(d, { medium: "flyer" }), 6, "colorOnly");
  assert.equal(x.status, "advisory");
  assert.deepEqual(x.detail.lostFor, []);
});

test("빨간 글자·검은 배경: 일반 눈은 통과, 적색맹으로 보면 대비가 떨어져요", () => {
  const d = fresh();
  const l = d.layers.find((x) => x.id === 6);
  l.color = "#FF0000"; l.colorRuns = ["#FF0000"];
  l.background = Object.assign({}, l.background, { samples: Array(50).fill("#000000"), stats: Object.assign({}, l.background.stats, { luminanceStdDev: 0 }) });
  const r = E.checkDocument(d, { medium: "flyer" });
  assert.equal(find(r, 6, "contrast").status, "pass");
  const x = find(r, 6, "cvd");
  assert.equal(x.status, "warn");
  assert.equal(x.detail.drops[0].type, "protan");
  assert.ok(x.detail.drops[0].worst < x.detail.target);
  assert.match(x.metric, /적색맹으로 보면/);
});

test("색만 다른 강조 → 자동 수정: 강조 쪽 밝기만 바꿔 색각이상으로도 구분, 배경 대비는 기준 유지", () => {
  const d = fresh();
  const l = d.layers.find((x) => x.id === 6);
  l.styleRuns = [run("11.8(토) ", "#C8102E"), run("19:30 공연 시작", "#2E8B57")];
  l.colorRuns = ["#C8102E", "#2E8B57"];
  const r = E.checkDocument(d, { medium: "flyer" });
  const x = find(r, 6, "colorOnly");
  assert.ok(x.fix, "수정이 있어요");
  assert.equal(x.fix.type, "color");
  assert.equal(x.fix.runs.length, 1);
  assert.equal(x.fix.runs[0].from, "#C8102E", "짧은 쪽(강조)을 바꿔요");
  assert.equal(x.fix.passes, true);
  // 바꾼 색은 색각이상으로 봐도 다른 색과 구분돼요
  const other = C.hexToRgb("#2E8B57"), nu = C.hexToRgb(x.fix.value);
  for (const t of x.detail.lostFor) assert.ok(C.deltaE(C.simulateCvd(nu, t), C.simulateCvd(other, t)) >= 0.12, t);
  assert.ok(x.fix.contrastAfter >= find(r, 6, "contrast").detail.target);
});

test("색각이상 대비 부족 → 자동 수정: 모든 색각이상 눈에서 기준을 넘는 밝기", () => {
  const d = fresh();
  const l = d.layers.find((x) => x.id === 6);
  l.color = "#FF0000"; l.colorRuns = ["#FF0000"];
  l.background = Object.assign({}, l.background, { samples: Array(50).fill("#000000"), stats: Object.assign({}, l.background.stats, { luminanceStdDev: 0 }) });
  const x = find(E.checkDocument(d, { medium: "flyer" }), 6, "cvd");
  assert.ok(x.fix && x.fix.type === "color");
  assert.equal(x.fix.passes, true);
  assert.ok(x.fix.contrastAfter >= x.detail.target);
  for (const t of ["protan", "deutan", "tritan"]) assert.ok(C.contrast(C.simulateCvd(C.hexToRgb(x.fix.value), t), [0, 0, 0]) >= x.detail.target, t);
});

test("색각이상 검사를 끄면(colorVision: false) 색 관련 항목이 없어요", () => {
  const d = fresh();
  d.layers.find((x) => x.id === 6).styleRuns = [run("11.8(토) ", "#C8102E"), run("19:30", "#2E8B57")];
  const r = E.checkDocument(d, { medium: "flyer", colorVision: false });
  assert.equal(r.results.filter((x) => x.check === "cvd" || x.check === "colorOnly").length, 0);
  assert.equal(r.environment.colorVision, false);
});

test("샘플 포스터에는 색 의존 문제가 없어요 (흙색 계열 글자)", () => {
  const r = E.checkDocument(fresh(), { medium: "sns" });
  assert.equal(r.results.filter((x) => x.check === "cvd" || x.check === "colorOnly").length, 0);
});

test("PSD의 글자 구간 스타일을 레이어 데이터로 읽는다 (v0.5)", () => {
  const src = read();
  const t = findLayer(src.children, 6).layer.text;
  t.styleRuns = [
    { length: 7, style: Object.assign({}, t.style, { fillColor: { r: 200, g: 16, b: 46 } }) },
    { length: t.text.length - 7, style: Object.assign({}, t.style, { fillColor: { r: 46, g: 139, b: 87 }, underline: true }) }
  ];
  const back = agPsd.readPsd(agPsd.writePsdBuffer(src, { invalidateTextLayers: true }), { useImageData: true });
  const l = extractFromPsd(back, { fileName: "a.psd" }).layers.find((x) => x.id === 6);
  assert.equal(l.styleRuns.length, 2);
  assert.equal(l.styleRuns[0].color, "#C8102E");
  assert.equal(l.styleRuns[1].underline, true);
  assert.equal(l.styleRuns[0].text, "11.8(토)");
});
