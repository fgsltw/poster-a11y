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

  var SCHEMA_VERSION = "0.1";
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
        weightGuess: guessWeight(input.fontPostScriptName || input.fontName, input.fontStyleName, input.fauxBold)
      },
      color: input.color || null,
      colorRuns: input.colorRuns || [],
      opacity: round(opacity * fill, 3),
      opacityDetail: { layer: round(opacity, 3), fill: round(fill, 3) },
      blendMode: input.blendMode || "normal",
      visible: input.visible !== false,
      bounds: b ? b.px : null,
      boundsMm: b ? b.mm : null,
      background: input.background || null,
      purpose: null,
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
    pxToMm: pxToMm,
    pxToPt: pxToPt,
    ptToPx: ptToPx,
    guessWeight: guessWeight,
    summarizeBackground: summarizeBackground,
    buildTextLayer: buildTextLayer,
    buildDocument: buildDocument
  };
});
