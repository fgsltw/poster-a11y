// 읽기 쉬운 글꼴(KoddiUD 온고딕)로 바꾸기: 엔진 제안 → PSD 적용 → 다시 검사
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const P = require("../engine/policies.js");
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
const find = (r, id, check) => r.results.find((x) => x.layerId === id && x.check === check);
const R = P.fontReplace;
const ON = { medium: "flyer", fontInstalled: true };

// 샘플: 6 "11.8(토) 19:30" 정보 · 8 "예술의전당 오페라극장 3층" 정보(Bold) · 9 가격 정보 · 4 영문 부제 예술
function withFont(id, name, extra) {
  const d = fresh();
  const l = d.layers.find((x) => x.id === id);
  l.font.name = l.font.postScriptName = name;
  Object.assign(l.font, extra || {});
  return { d, l };
}

test("정보 글자 + 장식 글꼴 + 설치돼 있음 → 온고딕으로 바꾸기 수정", () => {
  const { d } = withFont(6, "NanumBrush");
  const r = find(E.checkDocument(d, ON), 6, "font");
  assert.equal(r.fix.type, "font");
  assert.equal(r.fix.postScriptName, R.postScriptNames.regular);
  assert.equal(r.fix.weight, "regular");
  assert.equal(r.fix.upright, false);
  assert.equal(r.detail.fontReplace.status, "ready");
  assert.match(r.message, /KoddiUD 온고딕 Regular로 바꾸기를 제안/);
  const f = E.toApplyFixes(E.checkDocument(d, ON)).find((x) => x.layerId === 6 && x.type === "font");
  assert.deepEqual(
    { postScriptName: f.postScriptName, family: f.family, weight: f.weight, upright: f.upright },
    { postScriptName: "KoddiUDOnGothic-Regular", family: "KoddiUD 온고딕", weight: "regular", upright: false }
  );
});

test("굵기 맞추기: 400 이하 Regular · 500~700 Bold · 800 이상 ExtraBold", () => {
  const weightOf = (name, extra) => {
    const { d } = withFont(6, name, extra);
    return find(E.checkDocument(d, ON), 6, "font").fix.weight;
  };
  assert.equal(weightOf("NanumBrush-Light"), "regular");
  assert.equal(weightOf("NanumBrush"), "regular");
  assert.equal(weightOf("Roboto-CondensedMedium"), "bold");
  assert.equal(weightOf("Roboto-CondensedSemiBold"), "bold");
  assert.equal(weightOf("Roboto-CondensedBold"), "bold");
  assert.equal(weightOf("Roboto-CondensedExtraBold"), "extraBold");
  assert.equal(weightOf("Roboto-CondensedBlack"), "extraBold");
  assert.equal(weightOf("NanumBrush", { fauxBold: true }), "bold", "가짜 굵게를 켠 글자는 Bold");
});

test("기울임 글꼴이면 바로 선 글꼴로 바꾸고 가짜 기울임도 꺼요", () => {
  const d = fresh();
  d.layers.find((x) => x.id === 9).font.fauxItalic = true;
  const r = find(E.checkDocument(d, ON), 9, "font");
  assert.equal(r.fix.type, "font");
  assert.equal(r.fix.upright, true);
});

test("온고딕이 설치돼 있지 않거나 모르면 수정 대신 설치 안내", () => {
  const { d } = withFont(6, "NanumBrush");
  for (const fontInstalled of [false, undefined]) {
    const r = find(E.checkDocument(d, { medium: "flyer", fontInstalled }), 6, "font");
    assert.equal(r.fix, null);
    assert.equal(r.detail.fontReplace.status, fontInstalled === false ? "notInstalled" : "unknown");
    assert.match(r.message, /KoddiUD 온고딕을 설치하면 적용할 수 있어요/);
    assert.ok(r.message.includes(R.downloadUrl));
  }
});

test("중국어·일본어가 섞이면 글꼴은 그대로 두고 안내만", () => {
  for (const text of ["11.8(土) 19:30 開演", "11月8日 19:30", "チケット 19:30"]) {
    const { d, l } = withFont(6, "NanumBrush");
    l.text = text;
    const r = find(E.checkDocument(d, ON), 6, "font");
    assert.equal(r.fix, null, text);
    assert.equal(r.detail.fontReplace.status, "otherScript", text);
    assert.match(r.message, /글꼴은 그대로 둬요/);
  }
  // 한글·영문·숫자·기호만이면 바꿔요
  const { d, l } = withFont(6, "NanumBrush");
  l.text = "Concert 11.8(토) 19:30 · ₩50,000 ★";
  assert.equal(find(E.checkDocument(d, ON), 6, "font").fix.type, "font");
});

test("예술 글자는 바꾸지 않아요", () => {
  const { d } = withFont(4, "NanumBrush");
  const r = find(E.checkDocument(d, ON), 4, "font");
  assert.equal(r.status, "advisory");
  assert.equal(r.fix, null);
  assert.equal(r.detail.fontReplace, undefined);
});

test("'영문 전부 대문자'만 있으면 글꼴을 바꾸지 않아요 (글꼴로 안 고쳐져요)", () => {
  const { d, l } = withFont(6, "MalgunGothic");
  l.text = "SOLD OUT TONIGHT";
  const r = find(E.checkDocument(d, ON), 6, "font");
  assert.deepEqual(r.detail.issues, ["allCaps"]);
  assert.equal(r.fix, null);
});

test("이미 온고딕이면 다시 바꾸자고 하지 않아요", () => {
  const { d } = withFont(6, "KoddiUDOnGothic-Bold", {});
  d.layers.find((x) => x.id === 6).font.fauxItalic = true;
  const r = find(E.checkDocument(d, ON), 6, "font");
  assert.equal(r.fix, null);
  assert.equal(r.detail.fontReplace, undefined);
});

test("PSD 적용: 모든 글자 구간 글꼴을 바꾸고, 원본은 그대로, 다시 검사하면 글꼴 문제가 사라져요", () => {
  // 원본 PSD 6번 글꼴을 장식 글꼴로 바꾼 복사본에서 시작
  const src = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
  const l6 = findLayer(src.children, 6).layer;
  l6.text.style.font = { name: "NanumBrush" };
  l6.text.style.fauxItalic = true;
  const d = extractFromPsd(src, { fileName: "a.psd" });
  const fixes = E.toApplyFixes(E.checkDocument(d, ON)).filter((f) => f.type === "font");
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0].upright, true);

  const out = applyFixes(src, fixes);
  assert.equal(out.skipped.length, 0);
  assert.match(out.applied[0].message, /KoddiUD 온고딕 regular \(미리보기에는 반영 안 됨/);
  assert.equal(l6.text.style.font.name, "NanumBrush", "원본 객체는 그대로");

  const back = agPsd.readPsd(agPsd.writePsdBuffer(out.psd, WRITE_OPTIONS), { useImageData: true });
  const after = extractFromPsd(back, { fileName: "b.psd" });
  const a6 = after.layers.find((x) => x.id === 6);
  assert.equal(a6.font.postScriptName, "KoddiUDOnGothic-Regular");
  assert.equal(a6.font.fauxItalic, false);
  assert.equal(find(E.checkDocument(after, ON), 6, "font"), undefined, "다시 검사하면 글꼴 문제 없음");
});

test("PSD 적용 미리보기: renderText 가 있으면 새 글꼴로 다시 그리고, 넘치면 경고해요", () => {
  const src = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
  const calls = [];
  // 가짜 그리기: 아주 넓은 그림을 돌려줘서 포스터 밖으로 나가게
  const renderText = (text, px, color, fontName, o) => {
    calls.push({ text, px, color, fontName, o });
    const w = 5000, h = Math.round(px * 1.35);
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  };
  const fix = { layerId: 6, type: "font", postScriptName: "KoddiUDOnGothic-Bold", family: "KoddiUD 온고딕", weight: "bold", cssFamilies: R.cssFamilies };
  const out = applyFixes(src, [fix], { renderText });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fontName, "KoddiUDOnGothic-Bold");
  assert.deepEqual(calls[0].o, { cssFamilies: R.cssFamilies, weight: "bold" });
  assert.match(calls[0].color, /^#[0-9A-F]{6}$/i);
  assert.match(out.applied[0].message, /미리보기는 근사치/);
  const l = findLayer(out.psd.children, 6).layer;
  assert.equal(l.right - l.left, 5000);
  assert.ok(out.warnings.some((w) => /글꼴을 바꿨더니 포스터 밖으로 나가요/.test(w)), out.warnings.join("\n"));
});

test("postScriptName 이 없으면 적용하지 않아요", () => {
  const src = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
  const out = applyFixes(src, [{ layerId: 6, type: "font" }]);
  assert.equal(out.applied.length, 0);
  assert.match(out.skipped[0].reason, /postScriptName/);
});
