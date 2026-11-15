/*
 * PSD 파일 → 공통 레이어 데이터(JSON)
 *
 *   node tools/psd-to-json.js samples/sample-poster.psd
 *   node tools/psd-to-json.js 포스터.psd -o 결과.json
 *
 * 출력 형식은 docs/layer-data.md 참고. 포토샵 플러그인이 내보내는 JSON과 같은 형식이에요.
 */
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const { extractFromPsd } = require("../src/psd-extract.js");

// Node 에는 브라우저 캔버스가 없어서, 픽셀 배열만 만드는 함수를 넣어 줍니다.
agPsd.initializeCanvas(
  () => {
    throw new Error("캔버스가 필요한 기능은 쓰지 않아요 (useImageData 사용)");
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })
);

function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("-"));
  const oIdx = args.indexOf("-o");
  if (!input) {
    console.error("사용법: node tools/psd-to-json.js <파일.psd> [-o 결과.json]");
    process.exit(1);
  }
  const output = oIdx >= 0 ? args[oIdx + 1] : input.replace(/\.psd$/i, "") + ".layers.json";

  const buf = fs.readFileSync(input);
  const psd = agPsd.readPsd(buf, { useImageData: true });
  const data = extractFromPsd(psd, { fileName: path.basename(input), filePath: path.resolve(input) });
  fs.writeFileSync(output, JSON.stringify(data, null, 2));

  console.log(`${data.document.widthMm}×${data.document.heightMm}mm, ${data.document.ppi}ppi, 텍스트 레이어 ${data.layers.length}개 → ${output}`);
  for (const l of data.layers) {
    const bg = l.background && l.background.stats;
    console.log(
      `  [${l.id}] ${(l.groupPath.join("/") || "-").padEnd(6)} ${l.text.slice(0, 18).padEnd(18)} ${String(l.sizePt).padStart(5)}pt ${l.color} ` +
        (bg ? `배경 ${bg.darkestColor}~${bg.lightestColor}` : "배경 없음") +
        (l.warnings.length ? `  ⚠ ${l.warnings.join(" / ")}` : "")
    );
  }
  for (const w of data.warnings) console.log("⚠ " + w);
}

main();
