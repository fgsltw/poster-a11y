/*
 * 대표 샘플 '노키' PSD를 만들어요. (SNS 세로 이미지 1080×1350)
 *
 *   npm run sample:noki   →  samples/sample-noki.psd (+ .preview.png)
 *
 * 원본: samples/noki-poster.raster.psd — 팀이 만든 포스터예요. 글자가 모두 그림(래스터)으로 바뀌어 있어서
 * 그대로는 검사할 글자가 없어요. 그래서 모습은 원본 그대로 두고, 글자 레이어마다 '텍스트 정보'를 붙여요.
 *   - 레이어 그림(픽셀)·위치·배경 아트워크: 원본 그대로
 *   - 글: 레이어 이름의 ' — ' 뒤 (' / ' 는 줄바꿈)
 *   - 글자색: 그 레이어에서 가장 많이 쓴 색. '참가 안내'의 '무료'만 다른 색 (원본도 그래요)
 *   - 글자 크기: 같은 글을 Noto Sans KR로 그렸을 때의 높이(한 줄)·폭(여러 줄)이 원본 그림과 같아지는 크기
 *   - 굵기(글꼴 이름): 제목 Black, 한 줄 소개·항목 이름 Bold, 정보 글 Light, 나머지 Regular — 원본 모습에 맞췄어요
 *   - 레이어 ID: 원본에 없어서 차례대로 붙여요 (1 = 배경)
 * 이렇게 하면 포토샵에서 연 것처럼 검사·자동 수정이 돼요 (수정 미리보기는 원본 픽셀을 바꿔서 보여줘요).
 */
const fs = require("fs");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const agPsd = require("ag-psd");

agPsd.initializeCanvas(
  () => { throw new Error("캔버스 대신 imageData를 써요"); },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })
);
GlobalFonts.registerFromPath("C:/Windows/Fonts/NotoSansKR-VF.ttf", "Noto Sans KR");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "samples", "noki-poster.raster.psd");
const FONTS = { 300: "NotoSansKR-Light", 400: "NotoSansKR-Regular", 700: "NotoSansKR-Bold", 900: "NotoSansKR-Black" };
// 레이어 이름(' — ' 앞)별 굵기·자간 (원본 모습에 맞춘 값)
const LOOK = {
  "시리즈": { weight: 400, tracking: 200 },
  "제목": { weight: 900 },
  "한 줄 소개": { weight: 700 },
  "부제": { weight: 400 },
  "일시 항목": { weight: 700 }, "장소 항목": { weight: 700 }, "참가 항목": { weight: 700 }, "접근성 항목": { weight: 700 },
  "일시": { weight: 300 }, "장소": { weight: 300 }, "참가 안내": { weight: 300, accent: "무료" }, "접근성 안내": { weight: 300 },
  "팀 이름 풀이": { weight: 400 }
};

const hex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
const rgb = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

// 불투명한 픽셀의 색을 세어 많이 쓴 순서로
function colorsOf(img) {
  const m = new Map(), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 250) continue;
    const k = hex(d[i], d[i + 1], d[i + 2]);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}
// 두 색이 얼마나 다른지 (빨강 기운이 있는 강조색 고르기)
const warmth = (h) => { const c = rgb(h); return c.r - (c.g + c.b) / 2; };

// 같은 글을 Noto Sans KR 100px로 그렸을 때 잉크 크기
function ink(lines, weight, tracking) {
  const c = createCanvas(10, 10).getContext("2d");
  c.font = `${weight} 100px "Noto Sans KR"`;
  const track = (tracking / 1000) * 100;
  let w = 0, asc = 0, desc = 0;
  lines.forEach((t) => {
    const m = c.measureText(t);
    w = Math.max(w, m.actualBoundingBoxRight + m.actualBoundingBoxLeft + track * Math.max(0, [...t].length - 1));
    asc = Math.max(asc, m.actualBoundingBoxAscent); desc = Math.max(desc, m.actualBoundingBoxDescent);
  });
  return { w, asc, desc, h: asc + desc };
}

function main() {
  const psd = agPsd.readPsd(fs.readFileSync(SRC), { useImageData: true });
  const W = psd.width;
  // 원본에는 레이어 ID가 없어요. 수정이 레이어를 찾을 수 있게 차례대로 붙여요
  psd.children.forEach((l, i) => { if (l.id == null) l.id = i + 1; });
  psd.children.forEach((l, i) => {
    if (i === 0 || l.text) return; // 배경 아트워크
    const [key, raw] = l.name.split(" — ");
    const look = LOOK[key];
    if (!look || !raw) throw new Error("모르는 레이어예요: " + l.name);
    const lines = raw.split(" / ");
    const text = lines.join("\r");
    const tracking = look.tracking || 0;
    const m = ink(lines, look.weight, tracking);
    const lw = l.right - l.left, lh = l.bottom - l.top;
    // 한 줄은 높이로, 여러 줄은 가장 긴 줄의 폭으로 크기를 맞춰요
    const px = lines.length === 1 ? (lh / m.h) * 100 : (lw / m.w) * 100;
    const k = px / 100;
    const leading = lines.length > 1 ? (lh - m.h * k) / (lines.length - 1) + m.h * k * 0.0 : undefined;
    const cols = colorsOf(l.imageData);
    const main = cols[0];
    const style = (h) => {
      const s = { font: { name: FONTS[look.weight] }, fontSize: Math.round(px * 10) / 10, fillColor: rgb(h), fauxBold: false };
      if (tracking) s.tracking = tracking;
      if (leading) { s.leading = Math.round(leading * 10) / 10; s.autoLeading = false; }
      return s;
    };
    const t = { text, transform: [1, 0, 0, 1, l.left, Math.round(l.top + m.asc * k)], style: style(main) };
    if (look.accent && raw.startsWith(look.accent)) {
      const accent = cols.slice(1).sort((a, b) => warmth(b) - warmth(a))[0];
      t.styleRuns = [{ length: look.accent.length, style: style(accent) }, { length: text.length - look.accent.length, style: style(main) }];
    }
    l.text = t;
  });
  const out = path.join(ROOT, "samples");
  const buf = agPsd.writePsdBuffer(psd, { invalidateTextLayers: false });
  fs.writeFileSync(path.join(out, "sample-noki.psd"), buf);
  const c = createCanvas(psd.width, psd.height), g = c.getContext("2d");
  const d = g.createImageData(psd.width, psd.height); d.data.set(psd.imageData.data); g.putImageData(d, 0, 0);
  fs.writeFileSync(path.join(out, "sample-noki.preview.png"), c.toBuffer("image/png"));
  console.log(`sample-noki.psd: ${W}x${psd.height}px, 텍스트 레이어 ${psd.children.filter((l) => l.text).length}개, ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
}

main();
