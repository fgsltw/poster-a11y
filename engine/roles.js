/*
 * roles.js — 글자마다 역할(제목·일시·장소·가격·접근성 정보·기타)을 찾고, 대체텍스트 초안을 만들어요.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EngineRoles = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 팀 회의록의 규칙 + 한국어 시간 표현 보강
  var RULES = {
    date: /(\d{1,2}\s*[./월]\s*\d{1,2}\s*일?)|(\d{1,2}:\d{2})|([월화수목금토일]요일|\([월화수목금토일]\))|((오전|오후|저녁|밤)\s*\d{1,2}\s*시)/,
    place: /(극장|홀|아트센터|미술관|갤러리|무대|센터|공원|광장|도서관|회관|\d+층|\d+호)/,
    price: /(\d{1,3}(,\d{3})*\s*원|무료|[RSAV]석|예매)/,
    access: /(음성해설|화면해설|수어|자막|휠체어|배리어프리|점자|쉬운\s?글|보청)/
  };
  var LABELS = { title: "제목", date: "일시", place: "장소", price: "가격·예매", access: "접근성 정보", other: "그 외" };
  var ORDER = ["access", "price", "date", "place"]; // 한 글자에 여러 개가 맞으면 앞쪽을 골라요

  function matchRoles(text) {
    var out = [];
    for (var k in RULES) if (RULES[k].test(text)) out.push(k);
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
  function speakDate(text) {
    var s = text;
    s = s.replace(/(\d{1,2})\s*[./]\s*(\d{1,2})(?!\d)/g, function (_, m, d) { return Number(m) + "월 " + Number(d) + "일"; });
    s = s.replace(/\(([월화수목금토일])\)/g, function (_, d) { return " " + DAYS[d]; });
    s = s.replace(/(\d{1,2}):(\d{2})/g, function (_, h, mm) {
      h = Number(h); mm = Number(mm);
      var part = h < 12 ? "오전" : h < 18 ? "오후" : "저녁";
      var h12 = h % 12 === 0 ? 12 : h % 12;
      return part + " " + h12 + "시" + (mm ? " " + mm + "분" : "");
    });
    return s.replace(/\s+/g, " ").trim();
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
