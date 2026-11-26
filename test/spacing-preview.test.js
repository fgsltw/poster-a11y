// 줄 간격·자간 수정 미리보기: 원래 글자 그림을 줄·글자 덩어리로 나눠 밀어요 (근사치)
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const { applyFixes, findLayer } = require("../src/psd-apply.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

// 글자 그림 만들기: blocks = [{ x, y, w, h }] 에 검은 잉크
function layerWith(text, blocks, opts) {
  opts = opts || {};
  const W = opts.width || 200, H = opts.height || 30;
  const data = new Uint8ClampedArray(W * H * 4);
  for (const b of blocks) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) data[(y * W + x) * 4 + 3] = 255;
  return {
    id: 1, name: "글자", left: 100, top: 100, right: 100 + W, bottom: 100 + H, opacity: 1, blendMode: "normal",
    imageData: { width: W, height: H, data },
    text: {
      text, transform: [1, 0, 0, 1, 100, 120],
      style: Object.assign({ fontSize: 20, tracking: 0 }, opts.style || {}),
      paragraphStyle: { justification: opts.just || "left" }
    }
  };
}
const psdOf = (layer) => ({ width: 1000, height: 1000, children: [layer] });
const apply = (layer, fix) => applyFixes(psdOf(layer), [Object.assign({ layerId: 1, type: "spacing" }, fix)], { quick: true });
// 잉크가 있는 세로줄 구간 (첫 줄 높이 안에서)
function colRuns(img, y0 = 0, y1 = img.height - 1) {
  const out = []; let s = -1;
  for (let x = 0; x < img.width; x++) {
    let has = false;
    for (let y = y0; y <= y1 && !has; y++) has = img.data[(y * img.width + x) * 4 + 3] > 8;
    if (has && s < 0) s = x; else if (!has && s >= 0) { out.push([s, x - 1]); s = -1; }
  }
  if (s >= 0) out.push([s, img.width - 1]);
  return out;
}
const inkSum = (img) => { let n = 0; for (let i = 3; i < img.data.length; i += 4) n += img.data[i]; return n; };

test("자간: 글자마다 늘어난 간격만큼 밀고, 잉크 양은 그대로 (근사치 미리보기)", () => {
  // "ABCD": 글자 폭 10px, 틈 4px
  const blocks = [0, 1, 2, 3].map((i) => ({ x: i * 14, y: 5, w: 10, h: 20 }));
  const l = layerWith("ABCD", blocks);
  const before = inkSum(l.imageData);
  const out = apply(l, { letterSpacingEm: 0.5 }); // 20px × 0.5 = 글자마다 10px
  assert.match(out.applied[0].message, /미리보기는 근사치/);
  assert.equal(out.warnings.some((w) => /미리보기에 보이지 않아요/.test(w)), false);
  const img = findLayer(out.psd.children, 1).layer.imageData;
  assert.deepEqual(colRuns(img), [[0, 9], [24, 33], [48, 57], [72, 81]]);
  assert.equal(inkSum(img), before);
  assert.equal(l.imageData.width, 200, "원본 레이어는 그대로");
});

test("한글처럼 한 글자가 여러 덩어리여도(이 = ㅇ + ㅣ) 함께 움직여요", () => {
  // "이다": ㅇ(0~7) ㅣ(10~12) | 다(20~31)
  const l = layerWith("이다", [{ x: 0, y: 5, w: 8, h: 15 }, { x: 10, y: 2, w: 3, h: 20 }, { x: 20, y: 2, w: 12, h: 20 }]);
  const img = findLayer(apply(l, { letterSpacingEm: 0.5 }).psd.children, 1).layer.imageData;
  const r = colRuns(img);
  assert.deepEqual(r.slice(0, 2), [[0, 7], [10, 12]], "ㅇ과 ㅣ 사이는 그대로");
  assert.deepEqual(r[2], [30, 41], "다음 글자만 10px");
});

test("줄 간격: 둘째 줄부터 늘어난 만큼 아래로", () => {
  // 두 줄: 줄 높이 20, 틈 4 / 글자 크기 20, 자동 줄 간격(1.2배 = 24px) → 1.5배(30px): 줄마다 6px
  const l = layerWith("AB\rCD", [
    { x: 0, y: 0, w: 10, h: 20 }, { x: 14, y: 0, w: 10, h: 20 },
    { x: 0, y: 24, w: 10, h: 20 }, { x: 14, y: 24, w: 10, h: 20 }
  ], { height: 44 });
  const out = apply(l, { lineHeight: 1.5 });
  const fl = findLayer(out.psd.children, 1).layer;
  assert.equal(fl.imageData.height, 50);
  assert.equal(fl.bottom - fl.top, 50);
  assert.equal(fl.text.style.leading, 30);
  assert.match(out.applied[0].message, /근사치/);
});

test("가운데 정렬이면 늘어난 폭의 절반만큼 왼쪽으로도 넓어져요", () => {
  const blocks = [0, 1, 2].map((i) => ({ x: i * 14, y: 5, w: 10, h: 20 }));
  const out = apply(layerWith("ABC", blocks, { just: "center" }), { letterSpacingEm: 0.5 });
  const fl = findLayer(out.psd.children, 1).layer;
  assert.equal(fl.left, 90, "늘어난 20px의 절반");
  assert.deepEqual(colRuns(fl.imageData), [[0, 9], [24, 33], [48, 57]]);
});

test("줄 수와 그림의 줄 덩어리가 맞지 않으면 줄 간격 미리보기는 건너뛰고 알려요", () => {
  // 글은 두 줄인데 그림은 한 덩어리
  const l = layerWith("AB\rCD", [{ x: 0, y: 0, w: 24, h: 44 }], { height: 44 });
  const out = apply(l, { lineHeight: 1.5 });
  assert.match(out.applied[0].message, /미리보기에는 반영 안 됨/);
  assert.ok(out.warnings.some((w) => /미리보기에 보이지 않아요/.test(w)));
  assert.equal(findLayer(out.psd.children, 1).layer.text.style.leading, 30, "PSD 값은 그대로 바꿔요");
});

test("샘플 PSD: 자간을 넓히면 글자 폭이 늘고, 포스터 밖으로 나가면 경고해요", () => {
  const file = path.join(__dirname, "..", "samples", "sample-showcase.psd");
  const src = agPsd.readPsd(fs.readFileSync(file), { useImageData: true });
  const l8 = findLayer(src.children, 8).layer; // "휠체어 · 음성 안내 제공" 36px
  const w0 = l8.right - l8.left;
  const out = applyFixes(src, [{ layerId: 8, type: "spacing", letterSpacingEm: 0.1 }], { quick: true });
  const a = findLayer(out.psd.children, 8).layer;
  const grew = a.right - a.left - w0;
  // 공백 포함 14글자 → 최대 13번 × 3.6px ≈ 47px (붙은 덩어리가 있으면 조금 덜)
  assert.ok(grew > 30 && grew <= 48, String(grew));
  assert.match(out.applied[0].message, /자간 → 100/);
  assert.match(out.applied[0].message, /근사치/);
  const far = applyFixes(src, [{ layerId: 8, type: "spacing", letterSpacingEm: 3 }], { quick: true });
  assert.ok(far.warnings.some((w) => /^.접근성 안내. 간격을 넓혔더니 포스터 밖으로 나가요/.test(w)), far.warnings.join("\n"));
});

test("자간이 좁아 글자끼리 붙어 있어도(LGBTQIA+, 자간 -120) 글자 사이로 갈라서 고르게 넓혀요", () => {
  // "ABC": A(0~9)와 B(10~19)는 붙어 있고(한 조각), C(24~33)는 떨어져 있어요. B의 윗부분은 A 위로 걸쳐 있어요(겹친 획)
  const l = layerWith("ABC", [
    { x: 0, y: 8, w: 10, h: 17 }, // A
    { x: 10, y: 5, w: 10, h: 20 }, // B (A에 붙음)
    { x: 6, y: 5, w: 4, h: 2 }, // B의 가로획이 A 위로 (겹침)
    { x: 24, y: 5, w: 10, h: 20 } // C
  ]);
  const out = apply(l, { letterSpacingEm: 0.5 }); // 글자마다 10px
  const img = findLayer(out.psd.children, 1).layer.imageData;
  const runsAll = colRuns(img);
  // A는 그대로, B는 10px, C는 20px → 세 덩어리로 떨어져요
  assert.equal(runsAll.length, 3, JSON.stringify(runsAll));
  assert.equal(runsAll[2][0], 44, "C는 글자 두 개만큼(20px)");
  assert.equal(inkSum(img), inkSum(l.imageData), "잘린 픽셀 없이 그대로");
});
