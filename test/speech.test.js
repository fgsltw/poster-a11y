// 화면 낭독기가 이상하게 읽는 글자: 닮은 글자·꾸민 영문·장식 기호·한 글자씩 띄어 쓴 단어 ('참고')
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const P = require("../engine/policies.js");
const R = require("../engine/roles.js");
const { extractFromPsd } = require("../src/psd-extract.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const psd = agPsd.readPsd(fs.readFileSync(path.join(__dirname, "..", "samples", "sample-poster.psd")), { useImageData: true });
const fresh = () => extractFromPsd(psd, { fileName: "sample-poster.psd" });
const sp = (t) => R.speakable(t, P.speech);
const keys = (t) => sp(t).issues.map((i) => i.key);

test("영어 단어 속 키릴 닮은 글자는 영문으로 읽어요 (설날 포스터 'korean neш year')", () => {
  assert.equal(sp("korean neш year").text, "korean new year");
  assert.deepEqual(sp("korean neш year").issues, [{ key: "lookAlike", chars: ["ш"] }]);
  assert.equal(sp("ЯUSSIAN NIGHT").text, "RUSSIAN NIGHT");
  // 러시아어 단어 자체는 그대로 (영문자가 섞이지 않았으니까)
  assert.deepEqual(sp("Москва").issues, []);
  assert.deepEqual(sp("Доброе morning").issues, []);
});

test("꾸민 영문(수학 글자·동그라미 글자)은 보통 영문으로", () => {
  assert.equal(sp("𝓗𝓪𝓹𝓹𝔂 𝓝𝓮𝔀 𝓨𝓮𝓪𝓻").text, "Happy New Year");
  assert.equal(sp("Ⓢⓔⓞⓤⓛ").text, "Seoul");
  assert.deepEqual(keys("𝐁𝐎𝐋𝐃"), ["styled"]);
});

test("장식 기호와 글자 없이 쓴 결합 기호는 빼요 (설날 포스터 '͞•/͞ korean')", () => {
  assert.equal(sp("͞•/͞ korean").text, "korean");
  assert.equal(sp("͞•/͞_ 2023").text, "2023");
  assert.equal(sp("͞•/͞ig:@seolny").text, "ig:@seolny");
  assert.equal(sp("͞•/seolny.com").text, "seolny.com");
  assert.equal(sp("★★★ GRAND OPEN ★★★").text, "GRAND OPEN");
  assert.deepEqual(keys("͞•/͞ korean"), ["symbols"]);
});

test("뜻대로 읽는 기호·글자는 그대로 둬요", () => {
  for (const t of ["① 입장 → 2층", "주최 ○○문화재단 · 후원 ○○구청", "10AM_08PM", "café", "© 2026 ClearView", "LOVE 🎉 party", "A B", "R석 70,000원"]) {
    assert.deepEqual(sp(t).issues, [], t);
  }
  // 낱말 사이 •는 쉼표처럼 (알리지는 않아요)
  assert.equal(sp("음성해설 • 수어통역").text, "음성해설 · 수어통역");
});

test("한 글자씩 띄어 쓴 영문 단어는 붙여요 (WCAG F32)", () => {
  assert.equal(sp("S A L E 50%").text, "SALE 50%");
  assert.equal(sp("B T S  L I V E").text, "BTS LIVE");
  assert.deepEqual(keys("S A L E"), ["spaced"]);
});

test("검사: '참고'로 알리고, 고치기는 넣지 않아요. 대체텍스트 초안에는 읽기 좋은 글로", () => {
  const d = fresh();
  d.layers.find((l) => l.id === 2).text = "𝓢𝓹𝓻𝓲𝓷𝓰"; // 제목
  d.layers.find((l) => l.id === 11).text = "★ 주최 ○○문화재단 ★"; // 그 외
  const r = E.checkDocument(d, { medium: "sns" });
  const title = r.results.find((x) => x.layerId === 2 && x.check === "speech");
  assert.equal(title.status, "advisory");
  assert.equal(title.fix, null);
  assert.equal(title.detail.readAs, "Spring");
  assert.match(title.message, /대체텍스트 초안에는 “Spring”처럼 넣었어요/);
  const host = r.results.find((x) => x.layerId === 11 && x.check === "speech");
  assert.match(host.message, /옮길 때는 “주최 ○○문화재단”처럼 써 주세요/);
  assert.match(r.altTextDraft, /^공연 포스터\. Spring\./);
  assert.equal(E.toApplyFixes(r, { includeAdvisory: true }).filter((f) => f.layerId === 2 && f.type !== "size" && f.type !== "color").length, 0);
});

test("샘플 포스터에는 이상하게 읽는 글자가 없어요", () => {
  const r = E.checkDocument(fresh(), { medium: "wall" });
  assert.equal(r.results.filter((x) => x.check === "speech").length, 0);
});
