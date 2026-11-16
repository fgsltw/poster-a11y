/*
 * layer-data.js — 포토샵 연동(기술 A)이 검사 엔진(기술 B)에 넘기는 데이터를 만드는 공용 코드
 *
 * 같은 파일을 세 곳에서 씁니다.
 *   - 포토샵 플러그인(UXP): require("./lib/layer-data.js")
 *   - Node 변환기:          require("../plugin/lib/layer-data.js")
 *   - 브라우저 변환기:      <script src="...layer-data.js"> → window.LayerData
 * 그래서 포토샵에서 뽑든 PSD 파일에서 뽑든 결과 형식이 똑같습니다.
 * 형식 설명은 docs/layer-data.md 를 보세요.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LayerData = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SCHEMA_VERSION = "0.5";
  var MM_PER_INCH = 25.4;

  function round(n, digits) {
    if (n == null || !isFinite(n)) return null;
    var f = Math.pow(10, digits == null ? 2 : digits);
    return Math.round(n * f) / f;
  }

  function clamp255(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
  }

  function toHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map(function (v) {
          var s = clamp255(v).toString(16).toUpperCase();
          return s.length === 1 ? "0" + s : s;
        })
        .join("")
    );
  }

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  // WCAG 2.x 상대 휘도 (0~1)
  function relativeLuminance(r, g, b) {
    function ch(v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  }

  /*
   * CMYK ↔ RGB 변환 (인쇄용 포스터 대응)
   * 포토샵 기본 CMYK 프로필(U.S. Web Coated SWOP v2)을 근사한 다항식이에요. ag-psd 가 픽셀을 변환할 때
   * 쓰는 것과 같은 식이라, 글자색과 배경 픽셀이 같은 기준으로 RGB가 돼요.
   * 계수 출처: pdf.js (DeviceCmykCS, https://github.com/mozilla/pdf.js), Copyright 2012 Mozilla Foundation,
   * Apache License 2.0
   * 문서마다 실제 CMYK 프로필이 다를 수 있어서 결과는 '근사치'예요.
   */
  // c, m, y, k: 잉크 양 0~1  →  { r, g, b } 0~255
  function cmykToRgb(c, m, y, k) {
    var o = cmykToRgbRaw(c, m, y, k);
    return { r: clamp255(o[0]), g: clamp255(o[1]), b: clamp255(o[2]) };
  }

  // 반올림·자르기 전 값 (역변환 계산용)
  function cmykToRgbRaw(c, m, y, k) {
    var r = 255 +
      c * (-4.387332384609988 * c + 54.48615194189176 * m + 18.82290502165302 * y + 212.25662451639585 * k - 285.2331026137004) +
      m * (1.7149763477362134 * m - 5.6096736904047315 * y - 17.873870861415444 * k - 5.497006427196366) +
      y * (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) +
      k * (-21.86122147463605 * k - 189.48180835922747);
    var g = 255 +
      c * (8.841041422036149 * c + 60.118027045597366 * m + 6.871425592049007 * y + 31.159100130055922 * k - 79.2970844816548) +
      m * (-15.310361306967817 * m + 17.575251261109482 * y + 131.35250912493976 * k - 190.9453302588951) +
      y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) +
      k * (-20.737325471181034 * k - 187.80453709719578);
    var b = 255 +
      c * (0.8842522430003296 * c + 8.078677503112928 * m + 30.89978309703729 * y - 0.23883238689178934 * k - 14.183576799673286) +
      m * (10.49593273432072 * m + 63.02378494754052 * y + 50.606957656360734 * k - 112.23884253719248) +
      y * (0.03296041114873217 * y + 115.60384449646641 * k - 193.58209356861505) +
      k * (-22.33816807309886 * k - 180.12613974708367);
    return [r, g, b];
  }

  // RGB(0~255) → CMYK 잉크(0~1). cmykToRgb 의 역함수를 숫자로 풀어요 (가우스-뉴턴).
  // 표현할 수 없는 색(인쇄 색 영역 밖)은 가장 가까운 색으로 맞추고 error 를 돌려줘요.
  function rgbToCmyk(r, g, b) {
    function f(x, k) {
      var c = cmykToRgbRaw(x[0], x[1], x[2], k);
      return [c[0] - r, c[1] - g, c[2] - b];
    }
    function sq(e) { return e[0] * e[0] + e[1] * e[1] + e[2] * e[2]; }
    function solve(k) {
      var x = [0.3, 0.3, 0.3];
      for (var it = 0; it < 30; it++) {
        var e = f(x, k);
        var J = [[], [], []], h = 1e-4;
        for (var j = 0; j < 3; j++) {
          var x2 = x.slice();
          x2[j] += h;
          var e2 = f(x2, k);
          for (var i = 0; i < 3; i++) J[i][j] = (e2[i] - e[i]) / h;
        }
        // (JᵀJ) d = -Jᵀe
        var A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
        for (i = 0; i < 3; i++) {
          for (j = 0; j < 3; j++) for (var t = 0; t < 3; t++) A[i][j] += J[t][i] * J[t][j];
          for (t = 0; t < 3; t++) v[i] -= J[t][i] * e[t];
          A[i][i] += 1e-6;
        }
        var d = solve3(A, v);
        if (!d) break;
        for (i = 0; i < 3; i++) x[i] = Math.min(1, Math.max(0, x[i] + d[i]));
        if (Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) < 1e-7) break;
      }
      return { x: x, err: sq(f(x, k)) };
    }
    var k0 = 1 - Math.max(r, g, b) / 255;
    var best = null;
    var ks = [0, 0.25, 0.5, 0.75, 0.9, 1].map(function (s) { return k0 * s; });
    for (var n = 0; n < ks.length; n++) {
      var s = solve(ks[n]);
      // 오차가 거의 같으면 검정 잉크(K)를 더 쓰는 쪽을 골라요 (인쇄에서 흔한 방식)
      if (!best || s.err < best.err - 1 || (Math.abs(s.err - best.err) <= 1 && ks[n] > best.k)) best = { x: s.x, k: ks[n], err: s.err };
    }
    return { c: best.x[0], m: best.x[1], y: best.x[2], k: best.k, error: Math.sqrt(best.err) };
  }

  function solve3(A, v) {
    var det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    if (Math.abs(det) < 1e-12) return null;
    function d(col) {
      var M = A.map(function (row, i) { return row.map(function (val, j) { return j === col ? v[i] : val; }); });
      return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    }
    return [d(0) / det, d(1) / det, d(2) / det];
  }

  // 잉크 0~1 → 사람이 읽는 퍼센트 표기 { c, m, y, k } (정수 %)
  function cmykPercent(cmyk) {
    return { c: Math.round(cmyk.c * 100), m: Math.round(cmyk.m * 100), y: Math.round(cmyk.y * 100), k: Math.round(cmyk.k * 100) };
  }

  function pxToMm(px, ppi) {
    return ppi ? (px / ppi) * MM_PER_INCH : null;
  }

  function pxToPt(px, ppi) {
    return ppi ? (px * 72) / ppi : null;
  }

  function ptToPx(pt, ppi) {
    return ppi ? (pt * ppi) / 72 : null;
  }

  // 글꼴 이름과 가짜 굵게(faux bold)로 굵기를 추정합니다. 엔진은 이 값을 '추정'으로만 써야 해요.
  function guessWeight(fontName, styleName, fauxBold) {
    var s = ((fontName || "") + " " + (styleName || "")).toLowerCase();
    var weight = "regular";
    if (/(thin|hairline|extralight|ultralight|light|semilight)/.test(s)) weight = "light";
    if (/(medium)/.test(s)) weight = "medium";
    if (/(semibold|demibold|bold|black|heavy|extrabold|ultrabold)/.test(s)) weight = "bold";
    if (fauxBold && weight !== "bold") weight = "bold";
    return weight;
  }

  /*
   * 글자 영역의 배경 픽셀을 요약합니다.
   *
   * composite: 글자가 '빠진' 합성 이미지 또는 글자가 포함된 합성 이미지
   *   { data, width, height, components(3|4), originX, originY }  (origin = 문서 좌표에서 이 이미지의 왼쪽 위)
   * textMask:  글자 레이어 자체의 픽셀 (알파로 글자 모양을 알 수 있음). 없으면 null
   *   { data, width, height, components(4), originX, originY }
   * bounds:    검사할 영역 (문서 좌표) { left, top, right, bottom }
   * opts.compositeHasText: composite 에 글자가 그려져 있으면 true → 글자 픽셀은 빼고 셉니다.
   */
  function summarizeBackground(composite, textMask, bounds, opts) {
    opts = opts || {};
    var maxSamples = opts.maxSamples || 1024;
    var alphaThreshold = opts.alphaThreshold == null ? 0 : opts.alphaThreshold;
    // 글자 가장자리의 흐릿한(안티앨리어싱) 픽셀이 배경으로 섞이지 않게 글자 주변 몇 px도 뺍니다.
    var dilate = opts.maskDilatePx == null ? 1 : opts.maskDilatePx;
    var compositeHasText = !!opts.compositeHasText;

    var cc = composite.components || 4;
    var mc = textMask ? textMask.components || 4 : 0;

    function isTextPixel(x, y) {
      for (var dy = -dilate; dy <= dilate; dy++) {
        for (var dx = -dilate; dx <= dilate; dx++) {
          var mx = x + dx - textMask.originX;
          var my = y + dy - textMask.originY;
          if (mx < 0 || my < 0 || mx >= textMask.width || my >= textMask.height) continue;
          var a = mc === 4 ? textMask.data[(my * textMask.width + mx) * 4 + 3] : 255;
          if (a > alphaThreshold) return true;
        }
      }
      return false;
    }

    var pixels = []; // [r,g,b,lum]
    var excludedByMask = 0;

    for (var y = bounds.top; y < bounds.bottom; y++) {
      var cy = y - composite.originY;
      if (cy < 0 || cy >= composite.height) continue;
      for (var x = bounds.left; x < bounds.right; x++) {
        var cx = x - composite.originX;
        if (cx < 0 || cx >= composite.width) continue;

        if (textMask && compositeHasText && isTextPixel(x, y)) {
          excludedByMask++;
          continue;
        }

        var i = (cy * composite.width + cx) * cc;
        var r = composite.data[i];
        var g = composite.data[i + 1];
        var b = composite.data[i + 2];
        pixels.push([r, g, b, relativeLuminance(r, g, b)]);
      }
    }

    if (!pixels.length) {
      return { method: opts.method || "unknown", sampleCount: 0, excludedTextPixels: excludedByMask, samples: [], stats: null };
    }

    var sr = 0, sg = 0, sb = 0, sl = 0;
    var darkest = pixels[0], lightest = pixels[0];
    for (var k = 0; k < pixels.length; k++) {
      var p = pixels[k];
      sr += p[0]; sg += p[1]; sb += p[2]; sl += p[3];
      if (p[3] < darkest[3]) darkest = p;
      if (p[3] > lightest[3]) lightest = p;
    }
    var n = pixels.length;
    var meanL = sl / n;
    var varL = 0;
    for (k = 0; k < n; k++) varL += Math.pow(pixels[k][3] - meanL, 2);

    // 균등하게 골라 최대 maxSamples 개만 넘깁니다 (JSON 크기 제한)
    var samples = [];
    var step = Math.max(1, n / maxSamples);
    for (var s = 0; s < n && samples.length < maxSamples; s += step) {
      var q = pixels[Math.floor(s)];
      samples.push(toHex(q[0], q[1], q[2]));
    }

    return {
      method: opts.method || "unknown",
      sampleCount: n,
      excludedTextPixels: excludedByMask,
      samples: samples,
      stats: {
        meanColor: toHex(sr / n, sg / n, sb / n),
        darkestColor: toHex(darkest[0], darkest[1], darkest[2]),
        lightestColor: toHex(lightest[0], lightest[1], lightest[2]),
        luminanceMin: round(darkest[3], 4),
        luminanceMax: round(lightest[3], 4),
        luminanceMean: round(meanL, 4),
        luminanceStdDev: round(Math.sqrt(varL / n), 4)
      }
    };
  }

  function boundsWithMm(b, ppi) {
    var out = {
      left: b.left,
      top: b.top,
      right: b.right,
      bottom: b.bottom,
      width: b.right - b.left,
      height: b.bottom - b.top
    };
    return {
      px: out,
      mm: {
        left: round(pxToMm(out.left, ppi), 1),
        top: round(pxToMm(out.top, ppi), 1),
        width: round(pxToMm(out.width, ppi), 1),
        height: round(pxToMm(out.height, ppi), 1)
      }
    };
  }

  /*
   * 텍스트 레이어 하나를 공통 형식으로 만듭니다.
   * input: { id, name, groupPath, text, fontName, fontPostScriptName, fontStyleName, fauxBold,
   *          sizePx (변형까지 반영된 실제 크기), sizeSourcePx, scale, color(hex), colorRuns,
   *          opacity(0~1), fillOpacity(0~1), blendMode, visible, bounds, background, ppi, docKey, warnings }
   */
  /*
   * 줄 간격·자간
   *   input.leadingSourcePx: 줄 간격 (글꼴 크기와 같은 단위). 없으면 자동 줄 간격
   *   input.autoLeadingRatio: 자동 줄 간격 비율 (포토샵 기본 1.2)
   *   input.tracking: 포토샵 자간 (1/1000 em)
   */
  function buildSpacing(input) {
    var text = input.text || "";
    var lines = text.split(/\r\n|\r|\n/).filter(function (s) { return s.trim(); }).length || 1;
    var src = input.sizeSourcePx;
    var auto = input.leadingSourcePx == null || input.autoLeading === true;
    var ratio = auto ? (input.autoLeadingRatio || 1.2) : src ? input.leadingSourcePx / src : null;
    return {
      lineCount: lines,
      lineHeightRatio: ratio == null ? null : round(ratio, 3),
      autoLeading: auto,
      letterSpacingEm: input.tracking == null ? 0 : round(input.tracking / 1000, 3),
      note: "줄 수는 줄바꿈 기준이에요. 글상자 안에서 자동으로 넘어간 줄은 세지 않아요."
    };
  }

  function buildTextLayer(input) {
    var ppi = input.ppi;
    var b = input.bounds ? boundsWithMm(input.bounds, ppi) : null;
    var opacity = input.opacity == null ? 1 : input.opacity;
    var fill = input.fillOpacity == null ? 1 : input.fillOpacity;
    return {
      id: input.id,
      key: input.docKey + "#" + input.id,
      name: input.name || "",
      groupPath: input.groupPath || [],
      groupIds: input.groupIds || [],
      text: input.text || "",
      sizePt: round(pxToPt(input.sizePx, ppi), 1),
      sizePx: round(input.sizePx, 1),
      sizeMm: round(pxToMm(input.sizePx, ppi), 2),
      sizeDetail: {
        sourcePx: round(input.sizeSourcePx, 2),
        transformScale: round(input.scale, 4),
        note: "sizePt = 글꼴 크기 × 변형 비율 × 72 / ppi"
      },
      font: {
        name: input.fontName || null,
        postScriptName: input.fontPostScriptName || null,
        style: input.fontStyleName || null,
        fauxBold: !!input.fauxBold,
        // v0.4: 기울임(가짜 기울임 포함), 대문자 설정 ("all" | "small" | null)
        fauxItalic: !!input.fauxItalic,
        caps: input.caps || null,
        weightGuess: guessWeight(input.fontPostScriptName || input.fontName, input.fontStyleName, input.fauxBold)
      },
      // 줄·글자 간격 (v0.3). 비율은 모두 '글자 크기의 몇 배'
      spacing: buildSpacing(input),
      // 글자 기준점 (베이스라인 왼쪽, 문서 px). 글자 크기를 바꿀 때 이 점을 중심으로 커져요 (v0.3)
      origin: input.origin ? { x: round(input.origin.x, 1), y: round(input.origin.y, 1) } : null,
      color: input.color || null,
      colorSource: input.colorSource || null,
      colorRuns: input.colorRuns || [],
      // v0.5: 글자 구간이 여러 개일 때 구간마다 { text, color, sizePx, fontName, bold, italic, underline }
      styleRuns: input.styleRuns || [],
      opacity: round(opacity * fill, 3),
      opacityDetail: { layer: round(opacity, 3), fill: round(fill, 3) },
      blendMode: input.blendMode || "normal",
      visible: input.visible !== false,
      bounds: b ? b.px : null,
      boundsMm: b ? b.mm : null,
      background: input.background || null,
      purpose: null,
      purposeSource: null,
      purposeSuggested: null,
      warnings: input.warnings || []
    };
  }

  function buildDocument(input) {
    var ppi = input.ppi;
    return {
      schemaVersion: SCHEMA_VERSION,
      source: input.source, // "psd-file" | "photoshop"
      extractedAt: new Date().toISOString(),
      document: {
        key: input.docKey,
        name: input.name || null,
        path: input.path || null,
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        ppi: ppi,
        colorMode: input.colorMode || "RGB",
        widthMm: round(pxToMm(input.widthPx, ppi), 1),
        heightMm: round(pxToMm(input.heightPx, ppi), 1),
        purpose: null
      },
      groups: input.groups || [],
      layers: input.layers || [],
      warnings: input.warnings || []
    };
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    round: round,
    toHex: toHex,
    hexToRgb: hexToRgb,
    relativeLuminance: relativeLuminance,
    cmykToRgb: cmykToRgb,
    rgbToCmyk: rgbToCmyk,
    cmykPercent: cmykPercent,
    pxToMm: pxToMm,
    pxToPt: pxToPt,
    ptToPx: ptToPx,
    guessWeight: guessWeight,
    summarizeBackground: summarizeBackground,
    buildTextLayer: buildTextLayer,
    buildDocument: buildDocument
  };
});
