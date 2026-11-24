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
  var RULES = {
    // 11.8 · 11/8 · 11월 8일 · 2026.11.8 · 2026-11-08 · Nov 8 · 19:30 · (토) · 저녁 7시 (1.5km, 13.40 같은 숫자는 빼요)
    date: new RegExp("((?:^|[^\\d.])(0?[1-9]|1[0-2])\\s*[./월]\\s*(0?[1-9]|[12]\\d|3[01])(?![\\d.]|\\s*[A-Za-z%])\\s*일?)|(\\d{4}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*\\d{1,2})|(\\b(" + MONTHS_EN + ")[a-z]*\\.?\\s+\\d{1,2}\\b)|(\\d{1,2}:\\d{2})|([월화수목금토일]요일|\\([월화수목금토일]\\))|((새벽|오전|오후|낮|저녁|밤)\\s*\\d{1,2}\\s*시)", "i"),
    // 홀·센터·무대는 이름 끝에 붙을 때만 장소로 봐요 (콘서트홀, 아트센터, 야외무대).
    // "홀로 서는 밤", "홀수 날", "무대 위의 삶" 같은 제목은 장소가 아니에요.
    place: /(극장|미술관|갤러리|공원|광장|도서관|회관|[가-힣A-Za-z0-9](홀|센터|무대)|\d+층|\d+호)/,
    price: /(\d{1,3}(,\d{3})*\s*원|무료|[RSAV]석|예매)/,
    access: /(음성해설|화면해설|수어|자막|휠체어|배리어프리|점자|쉬운\s?글|보청)/
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
   */
  function classify(layers) {
    var visible = layers.filter(function (l) { return l.visible !== false && l.text && l.text.trim(); });
    var titleId = null, max = -1;
    visible.forEach(function (l) {
      if ((l.sizePt || 0) > max) { max = l.sizePt || 0; titleId = l.id; }
    });
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
    // 연도가 붙은 날짜 (월·일 규칙보다 먼저)
    s = s.replace(/(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?!\d)/g, function (_, y, m, d) { return y + "년 " + Number(m) + "월 " + Number(d) + "일"; });
    s = s.replace(new RegExp("\\b(" + MONTHS_EN + ")[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?", "gi"), function (_, mon, d, y) {
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

  // 대체텍스트 초안 (SNS·웹용). 디자이너·기획자가 다듬어서 쓰는 '초안'이에요.
  function altTextDraft(layers, roles, opts) {
    opts = opts || {};
    function pick(role) {
      return layers.filter(function (l) { return roles[l.id] && roles[l.id].role === role && l.visible !== false; }).map(function (l) { return l.text; });
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

  return { RULES: RULES, LABELS: LABELS, matchRoles: matchRoles, classify: classify, speakDate: speakDate, altTextDraft: altTextDraft };
});
