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

test("브라우저가 온고딕을 못 찾거나 모르면: 수정은 그대로 내고, 미리보기는 예시 + Adobe Fonts·받는 곳 안내", () => {
  const { d } = withFont(6, "NanumBrush");
  for (const fontInstalled of [false, undefined]) {
    const res = E.checkDocument(d, { medium: "flyer", fontInstalled });
    const r = find(res, 6, "font");
    assert.equal(r.fix.type, "font", "Adobe Fonts로 켠 글꼴은 브라우저에 안 보일 수 있어서 막지 않아요");
    assert.equal(r.fix.installed, fontInstalled === false ? false : null);
    assert.equal(r.detail.fontReplace.status, "ready");
    assert.match(r.message, /찾지 못해 미리보기는 비슷한 고딕으로/);
    assert.ok(r.message.includes(R.downloadUrl) && r.message.includes(R.adobeFontsUrl));
    const f = E.toApplyFixes(res).find((x) => x.layerId === 6 && x.type === "font");
    assert.equal(f.postScriptName, "KoddiUDOnGothic-Regular");
    assert.equal(f.installed, fontInstalled === false ? false : null);
  }
  // 찾았으면 안내 없이
  const r = find(E.checkDocument(d, ON), 6, "font");
  assert.equal(r.fix.installed, true);
  assert.doesNotMatch(r.message, /찾지 못해/);
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
  l.text = "SOLD OUT FOR TONIGHT ONLY";
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

// ---------------------------------------------------------------- 온고딕을 받기 싫으면: 내 컴퓨터 기본 고딕
test("온고딕을 못 찾으면 '내 컴퓨터 기본 고딕'을 고를 수 있다고 알려요", () => {
  const { d } = withFont(6, "NanumBrush");
  const r = find(E.checkDocument(d, { medium: "flyer", fontInstalled: false }), 6, "font");
  assert.match(r.message, /부가 기능 → 바꿀 글꼴/);
  assert.equal(r.detail.fontReplace.choice, "recommended");
});

test("바꿀 글꼴 = 내 컴퓨터 기본 고딕: Windows는 맑은 고딕, Mac은 Apple SD 산돌고딕 Neo", () => {
  const fixOf = (name, platform, extra) => {
    const { d } = withFont(6, name, extra);
    return find(E.checkDocument(d, { medium: "flyer", fontChoice: "system", platform }), 6, "font");
  };
  const w = fixOf("NanumBrush", "windows");
  assert.deepEqual([w.fix.family, w.fix.postScriptName, w.fix.installed], ["맑은 고딕", "MalgunGothic", true]);
  assert.equal(w.detail.fontReplace.choice, "system");
  assert.match(w.message, /받을 필요 없는 맑은 고딕 Regular로 바꾸기를 제안/);
  assert.match(w.message, /KoddiUD 온고딕이 더 알아보기 쉬우니/);
  assert.doesNotMatch(w.message, /찾지 못해/);
  // 맑은 고딕은 ExtraBold 가 없어서 Bold
  assert.equal(fixOf("Roboto-CondensedBlack", "windows").fix.postScriptName, "MalgunGothicBold");
  assert.equal(fixOf("Roboto-CondensedBold", "windows").fix.weightLabel, "Bold");
  const m = fixOf("Roboto-CondensedBold", "mac");
  assert.deepEqual([m.fix.family, m.fix.postScriptName], ["Apple SD 산돌고딕 Neo", "AppleSDGothicNeo-Bold"]);
  assert.equal(fixOf("Roboto-CondensedBlack", "mac").fix.postScriptName, "AppleSDGothicNeo-ExtraBold");
  // 운영체제를 모르면 기본(Windows) 글꼴, 설치 여부는 모름
  const u = fixOf("NanumBrush", undefined);
  assert.deepEqual([u.fix.postScriptName, u.fix.installed], ["MalgunGothic", null]);
});

test("기본 고딕으로 바꾼 PSD를 다시 검사하면 글꼴 문제가 없어요", () => {
  const src = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
  findLayer(src.children, 6).layer.text.style.font = { name: "NanumBrush" };
  const env = { medium: "flyer", fontChoice: "system", platform: "mac" };
  const fixes = E.toApplyFixes(E.checkDocument(extractFromPsd(src, { fileName: "a.psd" }), env)).filter((f) => f.type === "font");
  assert.equal(fixes[0].postScriptName, "AppleSDGothicNeo-Regular");
  const back = agPsd.readPsd(agPsd.writePsdBuffer(applyFixes(src, fixes).psd, WRITE_OPTIONS), { useImageData: true });
  const after = extractFromPsd(back, { fileName: "b.psd" });
  assert.equal(after.layers.find((x) => x.id === 6).font.postScriptName, "AppleSDGothicNeo-Regular");
  assert.equal(find(E.checkDocument(after, env), 6, "font"), undefined);
});

test("모르는 바꿀 글꼴·운영체제 값은 기본값으로", () => {
  const { d } = withFont(6, "NanumBrush");
  const r = E.checkDocument(d, { medium: "flyer", fontChoice: "nope", platform: "linux" });
  assert.equal(r.environment.fontChoice, "recommended");
  assert.equal(r.environment.platform, null);
  assert.equal(find(r, 6, "font").fix.postScriptName, "KoddiUDOnGothic-Regular");
});
