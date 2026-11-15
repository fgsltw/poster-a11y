/*
 * 수정 제안을 적용해 '접근성 버전' PSD를 만듭니다. 원본 파일은 그대로 둬요.
 *
 *   node tools/apply-fixes.js samples/sample-poster.psd samples/sample-fixes.json
 *   → samples/sample-poster.접근성버전.psd (+ .preview.png)
 *
 * 수정 목록 형식은 docs/apply-fixes.md 참고.
 */
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const { applyFixes, WRITE_OPTIONS } = require("../src/psd-apply.js");
const { extractFromPsd } = require("../src/psd-extract.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("캔버스가 필요한 기능은 쓰지 않아요 (useImageData 사용)");
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })
);

function savePreview(imageData, file) {
  let canvasLib;
  try {
    canvasLib = require("@napi-rs/canvas");
  } catch {
    return false; // 미리보기 PNG는 선택 기능
  }
  const c = canvasLib.createCanvas(imageData.width, imageData.height);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(imageData.width, imageData.height);
  img.data.set(imageData.data);
  ctx.putImageData(img, 0, 0);
  fs.writeFileSync(file, c.toBuffer("image/png"));
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const [input, fixesFile] = args.filter((a) => !a.startsWith("-"));
  const oIdx = args.indexOf("-o");
  if (!input || !fixesFile) {
    console.error("사용법: node tools/apply-fixes.js <원본.psd> <수정목록.json> [-o 결과.psd]");
    process.exit(1);
  }
  const output = oIdx >= 0 ? args[oIdx + 1] : input.replace(/\.psd$/i, "") + ".접근성버전.psd";
  if (path.resolve(output) === path.resolve(input)) {
    console.error("원본 파일을 덮어쓸 수 없어요. -o 로 다른 이름을 주세요.");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(fixesFile, "utf8"));
  const fixes = Array.isArray(raw) ? raw : raw.fixes;
  const psd = agPsd.readPsd(fs.readFileSync(input), { useImageData: true });
  const result = applyFixes(psd, fixes);

  fs.writeFileSync(output, agPsd.writePsdBuffer(result.psd, WRITE_OPTIONS));
  const previewFile = output.replace(/\.psd$/i, "") + ".preview.png";
  const hasPreview = savePreview(result.psd.imageData, previewFile);

  console.log(`접근성 버전 → ${output}${hasPreview ? ` (미리보기 ${previewFile})` : ""}`);
  for (const a of result.applied) console.log(`  ✓ [${a.fix.layerId}] ${a.message}`);
  for (const s of result.skipped) console.log(`  ✗ [${s.fix.layerId}] ${s.fix.type}: ${s.reason}`);
  for (const w of result.warnings) console.log(`  ⚠ ${w}`);

  // 결과 파일을 다시 읽어서 바뀐 값을 보여줘요
  const after = extractFromPsd(agPsd.readPsd(fs.readFileSync(output), { useImageData: true }), { fileName: path.basename(output) });
  const touched = new Set(fixes.map((f) => f.layerId));
  for (const l of after.layers.filter((x) => touched.has(x.id))) {
    const s = l.background && l.background.stats;
    console.log(`  → [${l.id}] ${l.text.slice(0, 16)} ${l.sizePt}pt ${l.color}` + (s ? ` 배경 ${s.darkestColor}~${s.lightestColor}` : ""));
  }
}

main();
