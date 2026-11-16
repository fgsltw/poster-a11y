/*
 * large-print.js — 저시력자를 위한 '큰 글씨 안내문'(A4, 고대비, 정보만)
 *
 *   draftText(layers, roles, speakDate)  → 안내문 기본 글 (사용자가 고쳐 쓸 수 있어요)
 *   layout(text, opts)                   → 쪽마다 그릴 줄 목록 (글자 폭 재는 함수는 밖에서 받아요)
 *   pdfFromJpegs(pages, opts)            → JPEG 쪽 이미지들을 A4 PDF 파일(Uint8Array)로
 *
 * 그리기(canvas)는 브라우저 페이지가 해요. 이 파일은 Node 에서도 테스트할 수 있게 순수 JS 로만 만들어요.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LargePrint = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var A4 = { widthMm: 210, heightMm: 297, widthPt: 595.28, heightPt: 841.89 };

  // 색 조합: 저시력자가 많이 쓰는 고대비 조합
  var THEMES = {
    whiteOnBlack: { label: "검은 바탕 · 흰 글씨", bg: "#000000", fg: "#FFFFFF", accent: "#FFFFFF", rule: "#FFFFFF" },
    yellowOnBlack: { label: "검은 바탕 · 노란 글씨", bg: "#000000", fg: "#FFE600", accent: "#FFFFFF", rule: "#FFE600" },
    blackOnWhite: { label: "흰 바탕 · 검은 글씨", bg: "#FFFFFF", fg: "#000000", accent: "#000000", rule: "#000000" },
    blackOnYellow: { label: "노란 바탕 · 검은 글씨", bg: "#FFE600", fg: "#000000", accent: "#000000", rule: "#000000" }
  };

  var ROLE_ORDER = ["date", "place", "price", "access"];
  var ROLE_LABELS = { date: "일시", place: "장소", price: "가격·예매", access: "접근성" };

  /*
   * 첫 줄 = 제목, 그다음 "라벨: 내용" 줄들
   * layers: 공통 레이어 데이터의 layers, roles: { [layerId]: "title" | "date" | ... }
   */
  function draftText(layers, roles, speakDate) {
    var visible = layers.filter(function (l) { return l.visible !== false && l.text && l.text.trim(); });
    var clean = function (t) { return String(t).replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim(); };
    var lines = [];
    var title = visible.filter(function (l) { return roles[l.id] === "title"; })[0];
    lines.push(title ? clean(title.text) : "안내");
    ROLE_ORDER.forEach(function (role) {
      var parts = visible.filter(function (l) { return roles[l.id] === role; }).map(function (l) {
        return role === "date" && speakDate ? speakDate(l.text) : clean(l.text);
      });
      if (parts.length) lines.push(ROLE_LABELS[role] + ": " + parts.join(" / "));
    });
    return lines.join("\n");
  }

  // 한 줄을 폭에 맞게 나눠요. 띄어쓰기에서 먼저 끊고, 한 단어가 너무 길면 글자 단위로 끊어요.
  function wrap(text, maxWidth, measure) {
    var words = String(text).split(/(\s+)/);
    var out = [], cur = "";
    words.forEach(function (w) {
      if (!w) return;
      var next = cur + w;
      if (measure(next.trim()) <= maxWidth) { cur = next; return; }
      if (cur.trim()) out.push(cur.trim());
      cur = /^\s+$/.test(w) ? "" : w;
      while (cur && measure(cur) > maxWidth) {
        var i = cur.length;
        while (i > 1 && measure(cur.slice(0, i)) > maxWidth) i--;
        out.push(cur.slice(0, i));
        cur = cur.slice(i);
      }
    });
    if (cur.trim()) out.push(cur.trim());
    return out.length ? out : [""];
  }

  /*
   * text: draftText 형식 (첫 줄 제목, "라벨: 내용")
   * opts: { pageWidthPx, pageHeightPx, marginPx, bodyPx, measure(text, sizePx, bold) → 폭(px) }
   * 돌려주는 값: { pages: [[{ kind: "title"|"label"|"body"|"rule", text, x, y, sizePx, bold }]], bodyPx }
   *   y 는 글자 위쪽 기준 (canvas textBaseline = "top")
   */
  function layout(text, opts) {
    var W = opts.pageWidthPx, H = opts.pageHeightPx, M = opts.marginPx, body = opts.bodyPx;
    var titlePx = Math.round(body * 1.6), labelPx = Math.round(body * 0.8);
    var lineGap = 1.5; // 줄 간격: 글자 크기의 1.5배 (WCAG 1.4.12)
    var maxW = W - M * 2;
    var lines = String(text || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var pages = [[]], y = M;
    function page() { return pages[pages.length - 1]; }
    function need(h) { if (y + h > H - M && page().length) { pages.push([]); y = M; } }
    function block(str, sizePx, bold, kind) {
      wrap(str, maxW, function (t) { return opts.measure(t, sizePx, bold); }).forEach(function (ln) {
        need(sizePx * lineGap);
        page().push({ kind: kind, text: ln, x: M, y: y, sizePx: sizePx, bold: bold });
        y += sizePx * lineGap;
      });
    }
    lines.forEach(function (ln, i) {
      if (i === 0) {
        block(ln, titlePx, true, "title");
        need(body * 0.8);
        page().push({ kind: "rule", x: M, y: y + body * 0.2, width: maxW, sizePx: Math.max(6, Math.round(body * 0.12)) });
        y += body * 0.9;
        return;
      }
      var m = ln.match(/^([^:：]{1,12})\s*[:：]\s*(.+)$/);
      if (m) {
        need(labelPx * lineGap + body * lineGap); // 라벨과 첫 줄은 같은 쪽에
        block(m[1], labelPx, true, "label");
        block(m[2], body, true, "body");
      } else {
        block(ln, body, true, "body");
      }
      y += body * 0.6; // 항목 사이 여백
    });
    return { pages: pages, bodyPx: body, titlePx: titlePx, labelPx: labelPx };
  }

  // ------------------------------------------------------------------ PDF (JPEG 쪽 이미지 → A4 PDF)
  function ascii(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }
  // PDF 문자열에 한글 제목을 넣을 때: UTF-16BE 16진수 <FEFF....>
  function pdfTextHex(str) {
    var hex = "FEFF";
    for (var i = 0; i < str.length; i++) hex += ("0000" + str.charCodeAt(i).toString(16).toUpperCase()).slice(-4);
    return "<" + hex + ">";
  }
  function jpegSize(bytes) {
    // SOF0/SOF2 표식에서 가로·세로를 읽어요
    var i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      var marker = bytes[i + 1];
      var len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xc3) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      i += 2 + len;
    }
    throw new Error("JPEG 크기를 읽지 못했어요.");
  }

  /*
   * pages: [Uint8Array(JPEG)], opts: { title }
   * 쪽마다 이미지를 A4 한 장에 꽉 채워요. 돌려주는 값: Uint8Array (PDF 파일)
   */
  function pdfFromJpegs(pages, opts) {
    opts = opts || {};
    if (!pages || !pages.length) throw new Error("쪽이 없어요.");
    var parts = [], offsets = [], length = 0;
    function push(b) { parts.push(b); length += b.length; }
    function obj(n, body) { offsets[n] = length; push(ascii(n + " 0 obj\n")); body.forEach(push); push(ascii("\nendobj\n")); }

    push(ascii("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
    var n = pages.length;
    // 1 카탈로그, 2 쪽 목록, 3 정보, 그다음 쪽마다 [쪽, 내용, 이미지]
    var kids = [];
    for (var i = 0; i < n; i++) kids.push((4 + i * 3) + " 0 R");
    obj(1, [ascii("<< /Type /Catalog /Pages 2 0 R /Lang (ko-KR) >>")]);
    obj(2, [ascii("<< /Type /Pages /Count " + n + " /Kids [" + kids.join(" ") + "] >>")]);
    obj(3, [ascii("<< /Title " + pdfTextHex(opts.title || "큰 글씨 안내문") + " /Producer (ClearView) >>")]);
    var W = A4.widthPt.toFixed(2), H = A4.heightPt.toFixed(2);
    pages.forEach(function (jpg, k) {
      var p = 4 + k * 3, c = p + 1, im = p + 2;
      var size = jpegSize(jpg);
      var content = "q " + W + " 0 0 " + H + " 0 0 cm /Im0 Do Q";
      obj(p, [ascii("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /XObject << /Im0 " + im + " 0 R >> >> /Contents " + c + " 0 R >>")]);
      obj(c, [ascii("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream")]);
      obj(im, [ascii("<< /Type /XObject /Subtype /Image /Width " + size.width + " /Height " + size.height +
        " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpg.length + " >>\nstream\n"), jpg, ascii("\nendstream")]);
    });
    var total = 4 + n * 3;
    var xref = length;
    var x = "xref\n0 " + total + "\n0000000000 65535 f \n";
    for (var j = 1; j < total; j++) x += ("0000000000" + offsets[j]).slice(-10) + " 00000 n \n";
    push(ascii(x + "trailer\n<< /Size " + total + " /Root 1 0 R /Info 3 0 R >>\nstartxref\n" + xref + "\n%%EOF\n"));

    var out = new Uint8Array(length), pos = 0;
    parts.forEach(function (b) { out.set(b, pos); pos += b.length; });
    return out;
  }

  return { A4: A4, THEMES: THEMES, draftText: draftText, wrap: wrap, layout: layout, pdfFromJpegs: pdfFromJpegs, jpegSize: jpegSize };
});
