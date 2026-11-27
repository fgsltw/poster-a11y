// 다국어 정보 찾기와 글꼴: 영어·일본어·중국어 포스터 문구, 일본·중국 붓글씨 글꼴 이름
//   npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agPsd = require("ag-psd");
const E = require("../engine/engine.js");
const R = require("../engine/roles.js");
const { extractFromPsd } = require("../src/psd-extract.js");

agPsd.initializeCanvas(
  () => {
    throw new Error("no canvas");
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
);

const info = (t) => R.matchRoles(t).filter((r) => r !== "title").sort();

// [문구, 기대 역할들] — 실제 포스터에 자주 나오는 문구 79개 (11/27 조사)
const CORPUS = {
  en: [
    ["Sat, Nov 29 · 7:30 PM", ["date"]], ["November 29, 2026", ["date"]], ["29 Nov – 7 Dec", ["date"]], ["Doors open 6pm", ["date"]],
    ["Fri 12.5 / Sat 12.6", ["date"]], ["Every Thursday 8–10pm", ["date"]], ["2026.12.24", ["date"]], ["Dec. 24th", ["date"]], ["12/24 (Wed)", ["date"]],
    ["22nd*Jan23", ["date"]], ["22-Jan-2023", ["date"]],
    ["Seoul Arts Center, Opera Theater", ["place"]], ["Blue Square Hall, 3F", ["place"]], ["Mapo Culture Center B1", ["place"]], ["Venue: LOTTE Concert Hall", ["place"]],
    ["Gallery 2, Seoul Museum of Art", ["place"]], ["Room 101, 3rd floor", ["place"]], ["Olympic Park, Seoul", ["place"]], ["Location: Seongsu-dong", ["place"]],
    ["Tickets ₩30,000", ["price"]], ["Free admission", ["price"]], ["Admission: 15,000 KRW", ["price"]], ["Book now at ticketlink.co.kr", ["price"]], ["Students $10", ["price"]], ["Reservation required", ["price"]],
    ["Audio description available", ["access"]], ["Wheelchair accessible", ["access"]], ["Korean & English subtitles", ["access"]], ["Sign language interpretation", ["access"]],
    ["THE RITE OF SPRING", []], ["Hall of Fame", []], ["Center of the Universe", []], ["Summer Jazz Night", []], ["Free Spirit", []], ["Sold out", []],
    ["Junction 5", []], ["Marshall Plan", []], ["Book club", []],
  ],
  ja: [
    ["11月29日(土) 19:30開演", ["date"]], ["2026年12月24日", ["date"]], ["12/24(水)", ["date"]], ["開場 18:00 / 開演 19:00", ["date"]], ["毎週木曜日", ["date"]],
    ["令和8年12月", ["date"]], ["平成元年", ["date"]],
    ["東京オペラシティ コンサートホール", ["place"]], ["渋谷区文化総合センター大和田", ["place"]], ["会場:サントリーホール", ["place"]], ["国立新美術館 3階", ["place"]], ["場所：渋谷", ["place"]],
    ["一般 3,000円", ["price"]], ["入場無料", ["price"]], ["前売券 2,500円 / 当日券 3,000円", ["price"]], ["チケット発売中", ["price"]], ["S席 8,000円", ["price"]],
    ["音声ガイドあり", ["access"]], ["車いす席あり", ["access"]], ["日本語字幕付き", ["access"]], ["手話通訳あり", ["access"]],
    ["春の祭典", []], ["光の庭", []], ["ジャズの夜", []],
  ],
  zh: [
    ["11月29日（周六）19:30", ["date"]], ["2026年12月24日", ["date"]], ["12月24日 星期三", ["date"]], ["每周四晚上8点", ["date"]], ["晚上7点半开始", ["date"]],
    ["上海大剧院", ["place"]], ["国家大剧院音乐厅", ["place"]], ["北京展览馆 3楼", ["place"]], ["地点：台北國家音樂廳", ["place"]], ["深圳音乐厅", ["place"]], ["中山公园", ["place"]],
    ["台中歌劇院", ["place"]], ["高雄市文化中心至德堂", ["place"]],
    ["票价 ¥180", ["price"]], ["免费入场", ["price"]], ["门票 120元", ["price"]], ["票價 NT$500", ["price"]], ["预约参观", ["price"]],
    ["提供口述影像", ["access"]], ["轮椅席", ["access"]], ["中英字幕", ["access"]], ["手语翻译", ["access"]], ["无障碍通道", ["access"]],
    ["春之祭", []], ["光之园", []], ["爵士之夜", []],
  ],
};

for (const [lang, cases] of Object.entries(CORPUS)) {
  test(`정보 찾기 (${lang}): 일시·장소·가격·접근성 문구를 찾고, 제목 같은 말은 넘겨요`, () => {
    const miss = cases.filter(([t, exp]) => JSON.stringify(info(t)) !== JSON.stringify(exp.slice().sort()));
    assert.deepEqual(miss.map(([t, exp]) => `${t} → ${info(t).join(",") || "-"} (기대 ${exp.join(",") || "-"})`), []);
  });
}

test("아직 못 찾는 문구는 일부러 넘겨요: 좌석 등급 'R 90,000'(뜻이 여러 가지), 고유 이름만 있는 장소", () => {
  assert.deepEqual(info("R 90,000 / S 70,000"), []);
  assert.deepEqual(info("横浜赤レンガ倉庫"), []);
});

test("날짜 읽기: 기호로 이은 날짜·두 자리 연도·일본 연호·開演/開場", () => {
  assert.equal(R.speakDate("22nd*Jan23"), "2023년 1월 22일");
  assert.equal(R.speakDate("22-Jan-2023"), "2023년 1월 22일");
  assert.equal(R.speakDate("Jan.22, 2026"), "2026년 1월 22일");
  assert.equal(R.speakDate("8 November 2026"), "2026년 11월 8일");
  assert.equal(R.speakDate("令和8年12月24日"), "2026년 12월 24일");
  assert.equal(R.speakDate("開場 18:00 / 開演 19:00"), "입장 저녁 6시 / 공연 시작 저녁 7시");
  // 시각은 연도로 읽지 않아요
  assert.equal(R.speakDate("22 Jan 19:30"), "1월 22일 저녁 7시 30분");
});

test("설날 포스터처럼 '22nd*Jan23'만 있어도 일시를 찾고 대체텍스트에 넣어요", () => {
  const d = extractFromPsd(agPsd.readPsd(fs.readFileSync(path.join(__dirname, "..", "samples", "sample-poster.psd")), { useImageData: true }), { fileName: "sample-poster.psd" });
  // 날짜 레이어(6 '11.8(토) 19:30', 5 '11월 8일 단 하루')를 설날 포스터처럼 바꿔요
  d.layers.find((l) => l.id === 6).text = "22nd*Jan23";
  d.layers.find((l) => l.id === 5).text = "happy seollal";
  const r = E.checkDocument(d, { medium: "wall" });
  assert.ok(!r.results.some((x) => /일시 정보를 찾지 못했어요/.test(x.message || "")));
  const roles = R.classify(d.layers);
  assert.match(R.altTextDraft(d.layers, roles, {}), /2023년 1월 22일/);
});

// ---------------------------------------------------------------- 글꼴 이름
function fontIssues(name) {
  const d = extractFromPsd(agPsd.readPsd(fs.readFileSync(path.join(__dirname, "..", "samples", "sample-poster.psd")), { useImageData: true }), { fileName: "sample-poster.psd" });
  const l = d.layers.find((x) => x.id === 6);
  l.font.name = l.font.postScriptName = name;
  const r = E.checkDocument(d, { medium: "flyer" }).results.find((x) => x.layerId === 6 && x.check === "font");
  return r && r.detail ? r.detail.issues : [];
}

test("일본·중국 붓글씨·장식 글꼴도 장식 글꼴로 찾아요 (회사 이름이 앞에 붙어도)", () => {
  for (const n of ["HGSGyoshotai", "HGSeikaishotaiPRO", "STXingkai", "FZShuTi", "STCaiyun", "STHupo", "KouzanBrushFontGyousyo", "ShokakiUtage-Fude", "HGPSoeiKakupoptai", "华文行楷", "方正舒体", "HG行書体", "AR丸ゴシック体M"]) {
    const expect = !/丸ゴシック|Seikaishotai/.test(n);
    assert.equal(fontIssues(n).includes("decorative"), expect, n);
  }
});

test("읽기 쉬운 글꼴은 장식 글꼴로 보지 않아요: 해서·예서·고딕, Poppins", () => {
  for (const n of ["KaiTi", "STKaiti", "LiSu", "Reisho101", "NotoSansJP-Regular", "PingFangSC-Regular", "Poppins-Bold", "MicrosoftYaHei", "HiraginoSans-W3"]) {
    assert.equal(fontIssues(n).includes("decorative"), false, n);
  }
});

test("다시 보기(11/27): 開場時間·開演時間을 한 낱말로 읽어요 ('입장時間'이 되지 않게)", () => {
  assert.equal(R.speakDate("開場時間 18:00"), "입장 저녁 6시");
  assert.equal(R.speakDate("開演時間 19:00"), "공연 시작 저녁 7시");
  assert.equal(R.speakDate("开场时间 18:00"), "입장 저녁 6시");
});
