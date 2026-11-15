/*
 * 브라우저 페이지를 인터넷에 올릴 수 있는 폴더(dist-web/)로 묶어요.
 *
 *   npm run build:web   →  dist-web/ (index.html, js 파일들, 샘플 PSD)
 *
 * 그다음 Vercel 같은 정적 호스팅에 dist-web 폴더만 올리면 돼요.
 * PSD 파일은 방문자의 브라우저 안에서만 처리되고, 서버로 올라가지 않아요.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist-web");

// 페이지가 쓰는 파일: [원래 위치, 배포 폴더 안 위치]
const FILES = [
  ["node_modules/ag-psd/dist/bundle.js", "vendor/ag-psd.js"],
  ["plugin/lib/layer-data.js", "lib/layer-data.js"],
  ["plugin/lib/purpose-store.js", "lib/purpose-store.js"],
  ["src/psd-extract.js", "lib/psd-extract.js"],
  ["src/psd-apply.js", "lib/psd-apply.js"],
  ["src/simulate.js", "lib/simulate.js"],
  ["engine/policies.js", "engine/policies.js"],
  ["engine/color.js", "engine/color.js"],
  ["engine/roles.js", "engine/roles.js"],
  ["engine/engine.js", "engine/engine.js"],
  ["samples/sample-poster.psd", "samples/sample-poster.psd"],
  ["samples/sample-poster-cmyk.psd", "samples/sample-poster-cmyk.psd"]
];

// index.html 안의 경로 바꾸기: [원래 문자열, 바꿀 문자열]
const REWRITES = [
  ['src="../node_modules/ag-psd/dist/bundle.js"', 'src="./vendor/ag-psd.js"'],
  ['src="../plugin/lib/layer-data.js"', 'src="./lib/layer-data.js"'],
  ['src="../plugin/lib/purpose-store.js"', 'src="./lib/purpose-store.js"'],
  ['src="../src/psd-extract.js"', 'src="./lib/psd-extract.js"'],
  ['src="../src/psd-apply.js"', 'src="./lib/psd-apply.js"'],
  ['src="../src/simulate.js"', 'src="./lib/simulate.js"'],
  ['src="../engine/', 'src="./engine/'],
  ['const SAMPLE_BASE = "../samples/";', 'const SAMPLE_BASE = "./samples/";']
];

function main() {
  // 예전 결과를 지우되, Vercel 연결 정보(.vercel)는 남겨서 같은 주소로 다시 배포되게 해요
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f !== ".vercel") fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
  for (const [from, to] of FILES) {
    const src = path.join(ROOT, from);
    if (!fs.existsSync(src)) throw new Error(`파일이 없어요: ${from} (npm install / npm run sample 을 먼저 해 주세요)`);
    fs.mkdirSync(path.dirname(path.join(OUT, to)), { recursive: true });
    fs.copyFileSync(src, path.join(OUT, to));
  }

  let html = fs.readFileSync(path.join(ROOT, "web/index.html"), "utf8");
  for (const [a, b] of REWRITES) {
    if (!html.includes(a)) throw new Error(`index.html 에서 '${a}' 를 찾지 못했어요. REWRITES 를 고쳐 주세요.`);
    html = html.split(a).join(b);
  }
  const leftover = html.match(/src="\.\.\/[^"]+"/g);
  if (leftover) throw new Error("바꾸지 않은 경로가 남아 있어요: " + leftover.join(", "));
  fs.writeFileSync(path.join(OUT, "index.html"), html);

  // 정적 호스팅 설정: 큰 PSD는 오래 캐시
  fs.writeFileSync(
    path.join(OUT, "vercel.json"),
    JSON.stringify({ headers: [{ source: "/samples/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] }] }, null, 2)
  );

  let total = 0;
  (function size(dir) {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) size(p);
      else total += st.size;
    }
  })(OUT);
  console.log(`dist-web/ 준비 완료 (${(total / 1024 / 1024).toFixed(1)}MB)`);
}

main();
