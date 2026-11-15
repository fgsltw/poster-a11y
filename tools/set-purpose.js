/*
 * PSD 안에 목적 정보(예술적 표현 / 정보 전달 / 복합)를 저장하거나 확인합니다.
 *
 *   확인:  node tools/set-purpose.js 포스터.psd
 *   저장:  node tools/set-purpose.js 포스터.psd --doc mixed --group 3=art --layer 5=info -o 결과.psd
 *          (원본에 바로 저장하려면 -o 대신 --in-place)
 *
 *   --doc   art | info | mixed      문서 전체 목적
 *   --group <그룹ID>=art|info        복합일 때 그룹 목적 (여러 번 써도 돼요)
 *   --layer <레이어ID>=art|info      복합일 때 레이어 목적 (그룹보다 우선)
 *   --clear-layer <레이어ID>         레이어 지정 지우기 (그룹·문서 목적을 따라감)
 */
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const PS = require("../plugin/lib/purpose-store.js");
const { extractFromPsd } = require("../src/psd-extract.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("캔버스가 필요한 기능은 쓰지 않아요 (useImageData 사용)");
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })
);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const input = args[0];
  if (!input || input.startsWith("-")) fail("사용법: node tools/set-purpose.js <파일.psd> [--doc art|info|mixed] [--group ID=art|info] [--layer ID=art|info] [-o 결과.psd | --in-place]");

  const psd = agPsd.readPsd(fs.readFileSync(input), { useImageData: true });
  const info = PS.readFromPsd(psd) || PS.empty();
  let changed = false;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--doc") {
      const v = args[++i];
      if (!PS.DOC_PURPOSES.includes(v)) fail(`--doc 값은 ${PS.DOC_PURPOSES.join(" | ")} 중 하나예요.`);
      info.document = v;
      changed = true;
    } else if (a === "--group" || a === "--layer") {
      const m = /^(\d+)=(art|info)$/.exec(args[++i] || "");
      if (!m) fail(`${a} 는 ID=art 또는 ID=info 형식이에요.`);
      info[a === "--group" ? "groups" : "layers"][m[1]] = m[2];
      changed = true;
    } else if (a === "--clear-layer") {
      delete info.layers[args[++i]];
      changed = true;
    }
  }

  const oIdx = args.indexOf("-o");
  const inPlace = args.includes("--in-place");
  if (changed) {
    const output = oIdx >= 0 ? args[oIdx + 1] : inPlace ? input : null;
    if (!output) fail("저장할 곳을 정해 주세요: -o 결과.psd 또는 --in-place");
    PS.writeToPsd(psd, info);
    fs.writeFileSync(output, agPsd.writePsdBuffer(psd));
    console.log(`목적 정보를 저장했어요 → ${output}`);
  }

  // 결과 확인 (저장한 파일을 다시 읽어서 보여줘요)
  const shownFile = changed ? (oIdx >= 0 ? args[oIdx + 1] : input) : input;
  const doc = extractFromPsd(agPsd.readPsd(fs.readFileSync(shownFile), { useImageData: true }), { fileName: path.basename(shownFile) });
  console.log(`문서 목적: ${doc.document.purpose ? PS.LABELS[doc.document.purpose] : "아직 안 정함"}`);
  for (const g of doc.groups) console.log(`  그룹 [${g.id}] ${g.name}: ${g.purpose ? PS.LABELS[g.purpose] : "-"}`);
  for (const l of doc.layers) {
    const src = { document: "문서", group: "그룹", layer: "레이어" }[l.purposeSource] || "";
    console.log(`  레이어 [${l.id}] ${l.text.slice(0, 18).padEnd(18)} ${l.purpose ? PS.LABELS[l.purpose] : "아직 안 정함"}${src ? ` (${src}에서)` : ""}`);
  }
}

main();
