// 영문 전부 대문자: 긴 문장만 '참고' + 대소문자 예시, 포토샵 '모두 대문자' 설정이면 끄기 수정
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const { extractFromPsd } = require("../src/psd-extract.js");
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
const find = (r, id) => r.results.find((x) => x.layerId === id && x.check === "font");
const ENV = { medium: "flyer" };
// 6번: 정보 글자 (일시). 글꼴은 평범한 고딕으로 두고 글만 바꿔요
function info(text, caps) {
  const d = fresh();
  const l = d.layers.find((x) => x.id === 6);
  l.font.name = l.font.postScriptName = "MalgunGothic";
  l.text = text;
  if (caps) l.font.caps = "all";
  return d;
}

test("짧은 영문은 전부 대문자여도 넘겨요 (SOLD OUT, 10AM_08PM, 약어)", () => {
  for (const t of ["SOLD OUT", "10AM_08PM", "OPEN 7PM VIP", "BTS LIVE SEOUL"]) {
    assert.equal(find(E.checkDocument(info(t), ENV), 6), undefined, t);
  }
  // 포토샵 '모두 대문자' 설정이어도 짧으면 넘겨요 (스크린샷의 10AM_08PM)
  assert.equal(find(E.checkDocument(info("10am_08pm", true), ENV), 6), undefined);
});

test("4단어부터는 잡아요 (BTS LIVE IN SEOUL)", () => {
  const r = find(E.checkDocument(info("BTS LIVE IN SEOUL"), ENV), 6);
  assert.equal(r.detail.caps.suggestedText, "BTS Live in Seoul", "3글자 약어(BTS)는 그대로");
});

test("긴 영문 문장(4단어 이상)을 직접 대문자로 쓰면 '참고' + 대소문자 예시, 자동 수정은 없어요", () => {
  const r = find(E.checkDocument(info("SOLD OUT FOR TONIGHT ONLY"), ENV), 6);
  assert.equal(r.status, "advisory");
  assert.deepEqual(r.detail.issues, ["allCaps"]);
  assert.match(r.metric, /긴 영문 문장 전부 대문자 \(5단어\)/);
  assert.deepEqual(r.detail.caps, { source: "typed", suggestedText: "Sold Out for Tonight Only" });
  assert.match(r.message, /읽는 속도가 느려질 수 있어요\(짧은 문구는 괜찮아요\).*“Sold Out for Tonight Only”/);
  assert.doesNotMatch(r.message, /단어 모양/);
  assert.equal(r.fix, null, "글자 내용을 바꾸는 건 디자이너가 직접");
});

test("대소문자 예시: 첫 글자만 대문자, 짧은 약어(AM·PM·VIP)는 그대로, 문장 가운데 of·the 는 소문자", () => {
  const r = find(E.checkDocument(info("OPEN AIR CONCERT AT 7 PM WITH VIP SEATS"), ENV), 6);
  assert.equal(r.detail.caps.suggestedText, "Open Air Concert at 7 PM with VIP Seats");
  const t = find(E.checkDocument(info("THE NIGHT OF THE ART FAIR\rSEOUL"), ENV), 6);
  assert.equal(t.detail.caps.suggestedText, "The Night of the Art Fair\rSeoul");
});

test("포토샵 '모두 대문자' 설정으로 대문자가 된 긴 문장 → '모두 대문자 끄기' 수정", () => {
  const res = E.checkDocument(info("open air concert in the park", true), ENV);
  const r = find(res, 6);
  assert.equal(r.status, "advisory");
  assert.equal(r.detail.caps.source, "setting");
  assert.equal(r.detail.caps.suggestedText, "open air concert in the park", "끄면 입력한 그대로 보여요");
  assert.match(r.message, /예: “open air concert in the park” 포토샵 '모두 대문자' 설정으로 대문자가 된 글자라, 설정을 끄면 위처럼/);
  assert.deepEqual([r.fix.type, r.fix.caps], ["caps", "normal"]);
  // '참고'라 기본 묶음엔 안 들어가고, 하나씩 고치기(includeAdvisory)에선 적용할 수 있어요
  assert.equal(E.toApplyFixes(res).some((f) => f.type === "caps"), false);
  const f = E.toApplyFixes(res, { includeAdvisory: true }).find((x) => x.layerId === 6 && x.type === "caps");
  assert.deepEqual([f.type, f.caps], ["caps", "normal"]);
});

test("예술 글자는 긴 대문자 문장이어도 '참고'만, 수정 없음", () => {
  const d = fresh();
  d.layers.find((x) => x.id === 4).font.caps = "all"; // 샘플 영문 부제 "THE RITE OF SPRING"
  const r = find(E.checkDocument(d, ENV), 4);
  assert.equal(r.status, "advisory");
  assert.equal(r.fix, null);
});

test("글꼴 문제도 함께 있으면 '주의' + 글꼴 수정이 먼저", () => {
  const d = info("open air concert in the park", true);
  d.layers.find((x) => x.id === 6).font.name = d.layers.find((x) => x.id === 6).font.postScriptName = "NanumBrush";
  const r = find(E.checkDocument(d, Object.assign({ fontInstalled: true }, ENV)), 6);
  assert.equal(r.status, "warn");
  assert.deepEqual(r.detail.issues, ["decorative", "allCaps"]);
  assert.equal(r.fix.type, "font");
});

test("PSD 적용: '모두 대문자'를 끄고 원본은 그대로, 다시 검사하면 문제 없음. renderText 가 있으면 다시 그려요", () => {
  const src = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
  const l6 = findLayer(src.children, 6).layer;
  l6.text.text = "open air concert in the park";
  l6.text.style.fontCaps = 2;
  l6.text.paragraphStyle = Object.assign({}, l6.text.paragraphStyle, { justification: "center" });
  const fixes = E.toApplyFixes(E.checkDocument(extractFromPsd(src, { fileName: "a.psd" }), ENV), { includeAdvisory: true }).filter((f) => f.type === "caps");
  assert.equal(fixes.length, 1);

  const plain = applyFixes(src, fixes, { quick: true });
  assert.match(plain.applied[0].message, /'모두 대문자' 끄기 \(미리보기에는 반영 안 됨/);
  assert.equal(l6.text.style.fontCaps, 2, "원본 객체는 그대로");
  const back = agPsd.readPsd(agPsd.writePsdBuffer(plain.psd, WRITE_OPTIONS), { useImageData: true });
  const after = extractFromPsd(back, { fileName: "b.psd" });
  assert.equal(after.layers.find((x) => x.id === 6).font.caps, null);
  assert.equal(find(E.checkDocument(after, ENV), 6), undefined);

  const calls = [];
  const renderText = (text, px, color, fontName, o) => {
    calls.push({ text, fontName, o });
    return { width: 300, height: Math.round(px * 1.35), data: new Uint8ClampedArray(300 * Math.round(px * 1.35) * 4) };
  };
  const drawn = applyFixes(src, fixes, { quick: true, renderText });
  assert.equal(calls[0].text, "open air concert in the park", "입력한 글자 그대로 (대문자로 바꾸지 않아요)");
  assert.match(drawn.applied[0].message, /미리보기는 근사치/);
  const d6 = findLayer(drawn.psd.children, 6).layer;
  assert.equal(d6.right - d6.left, 300);
  assert.equal(Math.round((d6.left + d6.right) / 2), Math.round(l6.text.transform[4]), "가운데 정렬이면 기준점 가운데에");
});
