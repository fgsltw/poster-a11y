/*
 * color.js — 대비 계산과 '같은 색상, 밝기만 조절' 추천색 찾기 (OKLCH)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EngineColor = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  }
  function rgbToHex(rgb) {
    return "#" + rgb.map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16).toUpperCase();
      return s.length < 2 ? "0" + s : s;
    }).join("");
  }
  function toLinear(v) {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function fromLinear(l) {
    var v = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    return v * 255;
  }

  // WCAG 상대 휘도와 대비
  function luminance(rgb) {
    return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
  }
  function contrastLum(l1, l2) {
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function contrast(a, b) {
    return contrastLum(luminance(a), luminance(b));
  }

  // 반투명 글자: 글자색 × 불투명도 + 배경 × (1 − 불투명도)  (화면 공간에서 섞음, 포토샵 '표준' 혼합)
  function blend(fg, bg, alpha) {
    return [fg[0] * alpha + bg[0] * (1 - alpha), fg[1] * alpha + bg[1] * (1 - alpha), fg[2] * alpha + bg[2] * (1 - alpha)];
  }

  // ---------------------------------------------------------------- OKLab / OKLCH (Björn Ottosson, 2020)
  function rgbToOklab(rgb) {
    var r = toLinear(rgb[0]), g = toLinear(rgb[1]), b = toLinear(rgb[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ];
  }
  function oklabToLinear(lab) {
    var l = Math.pow(lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2], 3);
    var m = Math.pow(lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2], 3);
    var s = Math.pow(lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2], 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    ];
  }
  function rgbToOklch(rgb) {
    var lab = rgbToOklab(rgb);
    return { L: lab[0], C: Math.hypot(lab[1], lab[2]), h: Math.atan2(lab[2], lab[1]) };
  }
  // 화면에 낼 수 없는 색이면 채도(C)를 줄여서 맞춰요
  function oklchToRgb(lch) {
    var C = lch.C;
    for (var i = 0; i < 30; i++) {
      var lin = oklabToLinear([lch.L, C * Math.cos(lch.h), C * Math.sin(lch.h)]);
      var ok = lin.every(function (v) { return v >= -1e-4 && v <= 1 + 1e-4; });
      if (ok) return lin.map(function (v) { return Math.max(0, Math.min(255, fromLinear(Math.max(0, Math.min(1, v))))); });
      C *= 0.85;
    }
    var g = fromLinear(Math.max(0, Math.min(1, Math.pow(lch.L, 3))));
    return [g, g, g];
  }

  /*
   * 글자색의 '색상'은 두고 밝기(L)만 바꿔서, 모든 배경 색에 대해 목표 대비를 넘는 색을 찾아요.
   *   bgLums: 배경 휘도 목록 (대표값 몇 개면 충분)
   *   maxShift: 밝기를 바꿀 수 있는 최대 폭 (OKLCH L, 0~1). 예술 목적이면 작게.
   * 돌려주는 값: { hex, contrast, passes, shift, direction } — 못 찾으면 가장 좋아진 색을 passes:false 로
   */
  function findAccessibleColor(textHex, bgLums, target, opts) {
    opts = opts || {};
    var maxShift = opts.maxShift == null ? 1 : opts.maxShift;
    var alpha = opts.alpha == null ? 1 : opts.alpha;
    var bgRgbs = opts.bgRgbs; // 반투명 글자면 배경 색이 필요해요
    var base = rgbToOklch(hexToRgb(textHex));

    function worst(rgb) {
      var min = Infinity;
      if (alpha < 1 && bgRgbs) {
        for (var i = 0; i < bgRgbs.length; i++) min = Math.min(min, contrast(blend(rgb, bgRgbs[i], alpha), bgRgbs[i]));
      } else {
        var l = luminance(rgb);
        for (var j = 0; j < bgLums.length; j++) min = Math.min(min, contrastLum(l, bgLums[j]));
      }
      return min;
    }

    var best = null;
    [-1, 1].forEach(function (dir) {
      for (var step = 1; step <= 100; step++) {
        var shift = (step / 100) * dir;
        if (Math.abs(shift) > maxShift + 1e-9) break;
        var L = base.L + shift;
        if (L < 0 || L > 1) break;
        var rgb = oklchToRgb({ L: L, C: base.C, h: base.h });
        var c = worst(rgb);
        var cand = { hex: rgbToHex(rgb), contrast: c, passes: c >= target, shift: Math.abs(shift), direction: dir < 0 ? "darker" : "lighter" };
        if (cand.passes) {
          if (!best || !best.passes || cand.shift < best.shift) best = cand;
          break; // 이 방향에서 가장 작은 변화
        }
        if (!best || (!best.passes && cand.contrast > best.contrast)) best = cand;
      }
    });
    return best;
  }

  return {
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    luminance: luminance,
    contrast: contrast,
    contrastLum: contrastLum,
    blend: blend,
    rgbToOklch: rgbToOklch,
    oklchToRgb: oklchToRgb,
    findAccessibleColor: findAccessibleColor
  };
});
