/*
 * roles.js — 글자마다 역할(제목·일시·장소·가격·접근성 정보·기타)을 찾고, 대체텍스트 초안을 만들어요.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EngineRoles = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 팀 회의록의 규칙 + 한국어 시간 표현 보강
  var MONTHS_EN = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
  // 달 이름 (줄임·전체). 뒤에 숫자가 바로 붙어도 돼요 (Jan23). "Junction"·"Marshall" 같은 말은 빼요
  var MONTH_WORD = "(" + MONTHS_EN + ")(?:uary|ruary|ch|il|e|y|ust|t|tember|ember|ober)?\\.?(?![a-z])";
  // 날짜 사이 구분 기호: 공백 · * · 점 · 하이픈 · 빗금 · 밑줄 (22nd*Jan23, 22.Jan, 22-Jan)
  var DSEP = "[\\s*·.\\-/_]";
  var DAYS_EN_RE = "Mon|Tue|Wed|Thu|Fri|Sat|Sun";
  var CJK = "\\u3040-\\u30FF\\u4E00-\\u9FFF"; // 가나·한자
  // 한국어 규칙 (팀 회의록 + 한국어 시간 표현) 에 영어·중국어·일본어 표현을 더했어요. 영어는 대소문자를 가리지 않아요.
  var RULES = {
    // 11.8 · 11/8 · 11월 8일 · 2026.11.8 · 2026-11-08 · 19:30 · (토) · 저녁 7시 (1.5km, 13.40 같은 숫자는 빼요)
    // 영어: Nov 8 · 8 November · Saturday · 7pm / 중국어·일본어: 11月8日 · 2026年 · (土) · 星期六 · 周六 · 土曜日 · 19時 · 7点
    date: new RegExp(
      "((?:^|[^\\d.])(0?[1-9]|1[0-2])\\s*[./월]\\s*(0?[1-9]|[12]\\d|3[01])(?![\\d.]|\\s*[A-Za-z%])\\s*일?)|(\\d{4}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*\\d{1,2})|" +
      "(\\b" + MONTH_WORD + DSEP + "+\\d{1,2}(st|nd|rd|th)?\\b)|(\\b\\d{1,2}(st|nd|rd|th)?" + DSEP + "*" + MONTH_WORD + ")|((令和|平成)\\s*(\\d{1,2}|元)\\s*年)|(\\b(" + DAYS_EN_RE + ")(day|urday|nesday|sday|rsday)?\\b)|(\\b\\d{1,2}(:\\d{2})?\\s*[ap]\\.?m\\.?(?![a-z]))|" +
      "(\\d{1,2}:\\d{2})|([월화수목금토일]요일|\\([월화수목금토일]\\))|((새벽|오전|오후|낮|저녁|밤)\\s*\\d{1,2}\\s*시)|" +
      "(\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日)|(\\d{4}\\s*年)|([（(][日月火水木金土一二三四五六天][)）])|(星期[一二三四五六日天]|周[一二三四五六日天]|[日月火水木金土]曜日?)|(\\d{1,2}\\s*[時时点])",
      "i"),
    // 홀·센터·무대는 이름 끝에 붙을 때만 장소로 봐요 (콘서트홀, 아트센터, 야외무대).
    // "홀로 서는 밤", "홀수 날", "무대 위의 삶" 같은 제목은 장소가 아니에요. 영어 Hall·Center·Stage도 같은 이유로
    // 이름 뒤(Concert Hall, Arts Center)에 올 때만, "Hall of Fame"·"Center of the World"처럼 of가 이어지면 빼요.
    place: new RegExp(
      "(극장|미술관|갤러리|공원|광장|도서관|회관|[가-힣A-Za-z0-9](홀|센터|무대)|\\d+층|\\d+호)|" +
      "(\\b(museums?|galler(y|ies)|auditorium|arena|library|plaza|venue|opera\\s+house)\\b)|(\\btheat(er|re)s?\\b(?!\\s+of\\b))|" +
      "(\\b[A-Za-z][A-Za-z.&'-]*\\s+(hall|cent(er|re)|square|park|stage)\\b(?!\\s+of\\b))|(\\b\\d+(st|nd|rd|th)?\\s*(f|fl|floor)\\b)|(\\bB\\d\\b)|" +
      "(\\b(venue|location|where)\\s*[:：])|((会場|会场|場所|地点|地點|場地)\\s*[:：])|" +
      "(劇場|剧场|剧院|劇院|会館|会馆|會館|[" + CJK + "][廳厅]|美術館|美术馆|博物館|博物馆|図書館|图书馆|画廊|ギャラリー|広場|广场|公園|公园|音楽堂|音乐厅|ホール|[" + CJK + "](センター|中心|ステージ)|\\d+\\s*[階楼])",
      "i"),
    // 영어: $25 · €20 · £10 · KRW 70,000 · tickets · admission · free entry / 중국어·일본어: 円·元 · ¥ · 無料·免费 · 前売·票价·门票·チケット
    price: new RegExp(
      "(\\d{1,3}(,\\d{3})*\\s*원|무료|[RSAV]석|예매)|" +
      "([$€£₩]\\s?\\d)|(\\bbook\\s+(now|online|tickets?|here)\\b)|(\\breservations?\\b)|(\\b(krw|usd|eur|jpy|won)\\s?\\d)|(\\d\\s?(krw|usd|eur|won)\\b)|(\\btickets?\\b)|(\\badmission\\b)|(\\bbooking\\b)|(\\bfree\\s+(entry|admission)\\b)|(\\b(entry|admission)\\s+free\\b)|" +
      "(\\d[\\d,]*\\s*[円元圓])|([¥￥]\\s?\\d)|(入場無料|無料|免费|免費|前売|前売券|当日券|票价|票價|门票|門票|チケット|入場料|入场费|予約|预约|預約)",
      "i"),
    // 영어: audio description · sign language · wheelchair · captions · subtitles · braille · barrier-free · accessible · hearing loop · relaxed performance
    // 중국어·일본어: 音声ガイド·音声解説 · 手話·手语 · 車いす·轮椅 · 字幕 · 点字 · バリアフリー·无障碍 · 口述影像
    access: new RegExp(
      "(음성해설|화면해설|수어|자막|휠체어|배리어프리|점자|쉬운\\s?글|보청)|" +
      "(\\baudio[\\s-]?descri(bed|ption)\\b|\\bsign\\s+language\\b|\\bwheelchair|\\bcaption(s|ed|ing)?\\b|\\bsubtitle(s|d)?\\b|\\bbraille\\b|\\bbarrier[\\s-]?free\\b|\\baccessib(le|ility)\\b|\\bhearing\\s+loop\\b|\\brelaxed\\s+performance\\b|\\bBSL\\b|\\bASL\\b)|" +
      "(音声ガイド|音声解説|音声描写|手話|手语|手語|車いす|車椅子|轮椅|輪椅|字幕|点字|點字|バリアフリー|无障碍|無障礙|無障碍|口述影像|助听|補聴)",
      "i")
  };

  var LABELS = { title: "제목", date: "일시", place: "장소", price: "가격·예매", access: "접근성 정보", other: "그 외" };
  var ORDER = ["access", "price", "date", "place"]; // 한 글자에 여러 개가 맞으면 앞쪽을 골라요

  function matchRoles(text) {
    var out = [];
    for (var k in RULES) if (RULES[k].test(text)) out.push(k);
    // 날짜가 있고 가격은 '예매'라는 말뿐이면(금액·좌석·무료 없음) 일시로 봐요. 예: "7.19(토) 매진 · 7.20(일) 예매 가능"
    if (out.indexOf("date") >= 0 && out.indexOf("price") >= 0 && !/(\d\s*원|무료|[RSAV]석)/.test(text)) out.splice(out.indexOf("price"), 1);
    return out;
  }

  /*
   * layers: 공통 레이어 데이터의 layers
   * 돌려주는 값: { [layerId]: { role, matches } }
   *   제목 = 보이는 글자 중 가장 큰 글자 (일시·장소 패턴이 있어도 가장 크면 제목)
   *   가장 큰 글자가 여럿이면 (11/26, Pride 포스터: FOREVER PROUD · 01 · 06 · 10AM_08PM 이 모두 같은 크기)
   *     ① 일시·장소·가격·접근성 정보가 아니고 ② 글자(숫자 말고)가 있는 것 → ③ 글자가 많은 것 → ④ 위에 있는 것
   */
  var TIE_RATIO = 0.98; // 가장 큰 글자의 98% 이상이면 '같은 크기'로 봐요
  function classify(layers) {
    var visible = layers.filter(function (l) { return l.visible !== false && l.text && l.text.trim(); });
    var max = visible.reduce(function (m, l) { return Math.max(m, l.sizePt || 0); }, 0);
    var tied = visible.filter(function (l) { return (l.sizePt || 0) >= max * TIE_RATIO; });
    var score = function (l) {
      var info = matchRoles(l.text || "").length > 0;
      var letters = (String(l.text).match(/[A-Za-z\u3131-\uD79D\u3040-\u30FF\u4E00-\u9FFF]/g) || []).length;
      return { plain: !info && letters >= 2 ? 1 : 0, letters: letters, top: l.bounds ? l.bounds.top : 0 };
    };
    tied.sort(function (a, b) {
      var A = score(a), B = score(b);
      return B.plain - A.plain || B.letters - A.letters || A.top - B.top;
    });
    var titleId = tied.length ? tied[0].id : null;
    var out = {};
    layers.forEach(function (l) {
      var m = matchRoles(l.text || "");
      var role = "other";
      if (l.id === titleId) role = "title";
      else for (var i = 0; i < ORDER.length; i++) if (m.indexOf(ORDER[i]) >= 0) { role = ORDER[i]; break; }
      out[l.id] = { role: role, matches: m };
    });
    return out;
  }

  // "11.8(토) 19:30" → "11월 8일 토요일 저녁 7시 30분"
  var DAYS = { 월: "월요일", 화: "화요일", 수: "수요일", 목: "목요일", 금: "금요일", 토: "토요일", 일: "일요일" };
  var MONTH_NO = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var DAY_SUFFIX = "(?:\\s*\\([월화수목금토일]\\))?";
  var MD = "\\d{1,2}\\s*[./]\\s*\\d{1,2}" + DAY_SUFFIX; // 11.8(토)
  var RANGE = "(?:\\s*[~∼〜–]\\s*|\\s+-\\s+)"; // 11.8~11.10 · 11.8 – 11.10 · 11.8 - 11.10
  var DAYS_EN = { sun: "일요일", mon: "월요일", tue: "화요일", wed: "수요일", thu: "목요일", fri: "금요일", sat: "토요일" };
  // 일본어(日月火水木金土)·중국어(一~六, 日·天) 요일
  var DAYS_CJK = { 日: "일요일", 月: "월요일", 火: "화요일", 水: "수요일", 木: "목요일", 金: "금요일", 土: "토요일",
    一: "월요일", 二: "화요일", 三: "수요일", 四: "목요일", 五: "금요일", 六: "토요일", 天: "일요일" };

  // 시각 → 하루 중 때: 0시 밤 12시, 1~5시 새벽, 6~11시 오전, 12~17시 오후, 18~20시 저녁, 21~23시 밤
  function speakTime(h, mm) {
    h = Number(h); mm = Number(mm);
    var part = h === 0 ? "밤" : h < 6 ? "새벽" : h < 12 ? "오전" : h < 18 ? "오후" : h < 21 ? "저녁" : "밤";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return part + " " + h12 + "시" + (mm ? " " + mm + "분" : "");
  }

  // "11.8(토) 19:30" → "11월 8일 토요일 저녁 7시 30분"  (대체텍스트·큰 글씨 안내문에서 소리 내어 읽기 좋게)
  //   연도: 2026.11.8 · 2026-11-08 → 2026년 11월 8일 / 영어: Nov 8, 2026 → 2026년 11월 8일
  //   기간: 11.8~11.10 → 11월 8일부터 11월 10일까지 / 19:30~21:00 → 저녁 7시 30분부터 밤 9시까지
  // 두 자리 연도 → 네 자리 (23 → 2023)
  function fullYear(y) { return y.length === 2 ? "20" + y : y; }

  function speakDate(text) {
    var s = String(text);
    // 기간의 '~'는 화면 낭독기가 '물결'로 읽어서 '부터 … 까지'로 바꿔요
    s = s.replace(new RegExp("(" + MD + ")" + RANGE + "(" + MD + "|\\d{1,2}" + DAY_SUFFIX + ")(?![\\d./])", "g"), function (_, a, b) {
      return a + "부터 " + (/[./]/.test(b) ? b : b.replace(/^(\d{1,2})/, "$1일")) + "까지";
    });
    // 영어 오전·오후: 7:30 PM → 19:30
    s = s.replace(/(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?/g, function (_, h, mm, ap) {
      h = Number(h) % 12 + (ap.toLowerCase() === "p" ? 12 : 0);
      return h + ":" + mm;
    });
    s = s.replace(/(\d{1,2}:\d{2})\s*[~∼〜–-]\s*(\d{1,2}:\d{2})/g, "$1부터 $2까지");
    s = s.replace(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\.?,?(?=\s)/gi, function (_, d) { return DAYS_EN[d.toLowerCase()]; });
    // 일본 연호: 令和8年 → 2026년, 平成31年 → 2019년 (元年 = 1년)
    s = s.replace(/(令和|平成)\s*(\d{1,2}|元)\s*年/g, function (_, era, n) { return ((era === "令和" ? 2018 : 1988) + (n === "元" ? 1 : Number(n))) + "년 "; });
    // 공연 시간 낱말: 開演 → 공연 시작, 開場 → 입장 (일본어·중국어)
    s = s.replace(/\s*(開演時間|開演|开演时间|开演)/g, " 공연 시작").replace(/\s*(開場時間|開場|开场时间|开场)/g, " 입장").replace(/\s*(終演|终演)/g, " 공연 끝");
    // 중국어·일본어: 2026年11月8日 · 11月8日 · (土) · 星期六 · 周六 · 土曜日 · 晚上7点半 · 19時30分
    s = s.replace(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, function (_, y, m, d) { return y + "년 " + Number(m) + "월 " + Number(d) + "일"; });
    s = s.replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, function (_, m, d) { return Number(m) + "월 " + Number(d) + "일"; });
    s = s.replace(/(\d{4})\s*年/g, "$1년");
    s = s.replace(/\s*[（(]([日月火水木金土一二三四五六天])[)）]/g, function (_, d) { return " " + DAYS_CJK[d] + " "; });
    s = s.replace(/(?:星期|周)([一二三四五六日天])/g, function (_, d) { return DAYS_CJK[d]; });
    s = s.replace(/([日月火水木金土])曜日?/g, function (_, d) { return DAYS_CJK[d]; });
    s = s.replace(/(上午|早上|午前|中午|下午|晚上|午後)?\s*(\d{1,2})\s*[時时点]\s*(半|(\d{1,2})\s*分)?/g, function (_, ap, h, half, mm) {
      h = Number(h);
      if (ap && /下午|晚上|午後/.test(ap) && h < 12) h += 12;
      if (ap && /上午|早上|午前/.test(ap) && h === 12) h = 0;
      return h + ":" + (half === "半" ? "30" : mm ? ("0" + Number(mm)).slice(-2) : "00");
    });
    // 영어 일·월 순서: 8 November 2026 → 2026년 11월 8일
    //   22nd*Jan23 · 22-Jan-2023 처럼 기호로 잇거나 두 자리 연도가 붙어도 (19:30 같은 시각은 연도로 안 봐요)
    s = s.replace(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?" + DSEP + "*" + MONTH_WORD + "(?:[\\s*·.\\-/_,']*(\\d{4}|\\d{2})(?![\\d:]))?", "gi"), function (_, d, mon, y) {
      return (y ? fullYear(y) + "년 " : "") + MONTH_NO[mon.toLowerCase()] + "월 " + Number(d) + "일";
    });
    // 연도가 붙은 날짜 (월·일 규칙보다 먼저)
    s = s.replace(/(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?!\d)/g, function (_, y, m, d) { return y + "년 " + Number(m) + "월 " + Number(d) + "일"; });
    s = s.replace(new RegExp("\\b" + MONTH_WORD + DSEP + "+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?", "gi"), function (_, mon, d, y) {
      return (y ? y + "년 " : "") + MONTH_NO[mon.toLowerCase()] + "월 " + Number(d) + "일";
    });
    // 월·일: 앞이 숫자인 경우(연도 일부)는 빼요
    s = s.replace(/(^|[^\d.])(\d{1,2})\s*[./]\s*(\d{1,2})(?![\d.]|\s*[A-Za-z%])/g, function (all, pre, m, d) {
      if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return all;
      return pre + Number(m) + "월 " + Number(d) + "일";
    });
    s = s.replace(/\s*\(([월화수목금토일])\)/g, function (_, d) { return " " + DAYS[d]; });
    s = s.replace(/(\d{1,2}):(\d{2})/g, function (_, h, mm) { return speakTime(h, mm); });
    return s.replace(/\s+/g, " ").replace(/ (부터|까지)/g, "$1").trim();
  }

  function clean(t) {
    return String(t || "").replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim();
  }

  // ---------------------------------------------------------------- 화면 낭독기가 읽기 좋은 글로 (11/27)
  //   S = policies.speech. 돌려주는 값: { text: 읽기 좋은 글, issues: [{ key, chars: [보인 글자] }] }
  //   - styled: 꾸민 영문(𝓗 수학 글자 U+1D400~, Ⓐ U+24B6~, 🄰 U+1F130~) → 보통 영문 (NFKC)
  //   - lookAlike: 영어 단어 속 키릴·그리스 닮은 글자 → S.lookAlike 의 영문자 (korean neш → new)
  //   - symbols: 장식 기호(★, 글자 없이 쓴 결합 기호 ͞)는 빼요. 화살표·©·※처럼 뜻대로 읽는 기호(S.okSymbols)는 그대로
  //   - spaced: 'S A L E'처럼 영문을 한 글자씩 띄어 쓴 단어(S.spacedLettersMin 글자 이상) → 'SALE'
  //   ᴴᴱᴸᴸᴼ(작은 위 글자 U+1D2C~1D6A)도 꾸민 영문이에요. 🅑🅞(U+1F150~)·🅱(U+1F170~)은 NFKC로 안 바뀌어서 직접 바꿔요
  var STYLED = /[\uD835][\uDC00-\uDFFF]|[\u24B6-\u24E9]|[\u1D2C-\u1D6A]|\uD83C[\uDD30-\uDD89]/g;
  var DECOR = /\p{So}|[•◦‣∙⁃]/u;
  function speakable(text, S) {
    S = S || {};
    var found = {};
    var order = [];
    function note(key, ch) {
      if (!found[key]) { found[key] = []; order.push(key); }
      if (found[key].indexOf(ch) < 0) found[key].push(ch);
    }
    var t = String(text || "");
    // 꾸민 영문
    t = t.replace(STYLED, function (c) {
      var cp = c.codePointAt ? c.codePointAt(0) : 0;
      var n = cp >= 0x1f150 && cp <= 0x1f169 ? String.fromCharCode(65 + cp - 0x1f150)
        : cp >= 0x1f170 && cp <= 0x1f189 ? String.fromCharCode(65 + cp - 0x1f170)
        : c.normalize ? c.normalize("NFKC") : c;
      if (/^[A-Za-z0-9]$/.test(n)) { note("styled", c); return n; }
      return c;
    });
    // 영어 단어 속 닮은 글자 (영문자가 함께 있는 단어만. 러시아어·그리스어 단어는 그대로)
    var map = S.lookAlike || {};
    t = t.replace(/[\p{L}\p{M}]+/gu, function (w) {
      if (!/[A-Za-z]/.test(w) || !/[\u0370-\u03FF\u0400-\u052F]/.test(w)) return w;
      // 키릴·그리스 글자가 더 많으면 그 나라 말에 영문자가 섞인 것 (Пpивет) → 영문으로 바꾸지 않아요
      var latin = (w.match(/[A-Za-z]/g) || []).length, other = (w.match(/[\u0370-\u03FF\u0400-\u052F]/g) || []).length;
      if (other > latin) return w;
      return w.replace(/[\u0370-\u03FF\u0400-\u052F]/g, function (c) {
        note("lookAlike", c);
        return map[c] != null ? map[c] : c;
      });
    });
    // 낱말 사이 가운뎃점(•)은 쉼표처럼 읽게 (음성해설 • 수어통역)
    t = t.replace(/\s[•●◦∙]\s/g, " · ");
    // 장식 기호와 글자 없이 쓴 결합 기호
    var ok = S.okSymbols || "";
    var removed = false;
    var out = "";
    var chars = Array.from ? Array.from(t) : t.split("");
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      var prev = out.slice(-1);
      if (/\p{M}/u.test(c) && !/\p{L}/u.test(prev)) { note("symbols", "◌" + c); removed = true; continue; }
      if (DECOR.test(c) && ok.indexOf(c) < 0 && !/\p{Extended_Pictographic}/u.test(c)) { note("symbols", c); removed = true; out += " "; continue; }
      out += c;
    }
    t = out;
    // 기호를 뺀 자리에 남은 꾸밈 줄(/ _ | ~ *)도 정리
    if (removed) t = t.replace(/(^|\s)[\/\\_|~*]+(?=\s|$)/g, "$1").replace(/^[\s\/\\_|~*]+|[\s\/\\_|~*]+$/g, "").replace(/[\/\\_|~*]{2,}/g, " ");
    // 한 글자씩 띄어 쓴 영문
    var min = S.spacedLettersMin || 3;
    t = t.replace(new RegExp("(^|[^A-Za-z])((?:[A-Za-z] ){" + (min - 1) + ",}[A-Za-z])(?![A-Za-z])", "g"), function (_, pre, run) {
      note("spaced", run);
      return pre + run.replace(/ /g, "");
    });
    t = t.replace(/\s+/g, " ").trim();
    return { text: t, issues: order.map(function (k) { return { key: k, chars: found[k] }; }) };
  }

  // 대체텍스트 초안 (SNS·웹용). 디자이너·기획자가 다듬어서 쓰는 '초안'이에요.
  function altTextDraft(layers, roles, opts) {
    opts = opts || {};
    function pick(role) {
      return layers.filter(function (l) { return roles[l.id] && roles[l.id].role === role && l.visible !== false; }).map(function (l) {
        return opts.speech ? speakable(l.text, opts.speech).text : l.text; // 화면 낭독기가 읽기 좋은 글로
      }).filter(Boolean);
    }
    var parts = [opts.kind || "공연 포스터"];
    var title = pick("title")[0];
    if (title) parts.push(clean(title));
    var when = pick("date").map(speakDate);
    var where = pick("place").map(clean);
    var line = [when.join(", "), where.join(", ")].filter(Boolean).join(", ");
    if (line) parts.push(line);
    pick("price").forEach(function (t) { parts.push(clean(t)); });
    pick("access").forEach(function (t) { parts.push(clean(t)); });
    return parts.join(". ").replace(/\.\./g, ".") + ".";
  }

  return { RULES: RULES, LABELS: LABELS, matchRoles: matchRoles, classify: classify, speakDate: speakDate, speakable: speakable, altTextDraft: altTextDraft };
});
