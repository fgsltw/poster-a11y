/*
 * simulate.js — 포스터가 다른 사람·다른 환경에서 어떻게 보이는지 미리보기 이미지를 만들어요.
 *
 *   - 색각이상: 적색맹(protan) · 녹색맹(deutan) · 청색맹(tritan)
 *   - 저시력: 관람 거리와 시력으로 계산한 흐림
 *   - 대비 저하: 백내장·눈부심처럼 뿌옇게 보이는 상태
 *   - 어두운 조명: 저녁 야외, 어두운 복도
 *
 * 모두 '근사치'예요. 디자이너가 문제를 눈으로 확인하는 용도이고, 합격·불합격 판정은 검사 엔진(B)이 해요.
 * 입력·출력: { width, height, data: RGBA Uint8ClampedArray }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Simulate = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 색각이상 행렬 (선형 RGB, 심한 정도 1.0)
  // 출처: Machado, Oliveira, Fernandes (2009) "A Physiologically-based Model for Simulation of Color Vision Deficiency"
  var CVD = {
    protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
    tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039]
  };
  var LABELS = {
    cvd: { protan: "적색맹 (제1색각이상)", deutan: "녹색맹 (제2색각이상)", tritan: "청색맹 (제3색각이상)" },
    lighting: { normal: "보통 조명", dim: "어두운 조명", dark: "아주 어두운 조명" }
  };
  // 조명별 밝기 배율 (선형 빛의 양)
  var LIGHTING = { normal: 1, dim: 0.35, dark: 0.12 };

  // sRGB(0~255) ↔ 선형(0~1) 변환표
  var toLinear = new Float32Array(256);
  for (var i = 0; i < 256; i++) {
    var v = i / 255;
    toLinear[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function toSrgb(l) {
    l = l <= 0 ? 0 : l >= 1 ? 1 : l;
    var v = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    return Math.round(v * 255);
  }

  function copy(img) {
    return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  }

  // 미리보기는 크게 할 필요가 없어서 줄여서 계산해요 (평균으로 줄이기)
  function downscale(img, maxWidth) {
    if (img.width <= maxWidth) return { image: copy(img), scale: 1 };
    var s = maxWidth / img.width;
    var w = Math.round(img.width * s), h = Math.round(img.height * s);
    var out = new Uint8ClampedArray(w * h * 4);
    for (var y = 0; y < h; y++) {
      var y0 = Math.floor(y / s), y1 = Math.min(img.height, Math.floor((y + 1) / s));
      for (var x = 0; x < w; x++) {
        var x0 = Math.floor(x / s), x1 = Math.min(img.width, Math.floor((x + 1) / s));
        var acc = [0, 0, 0, 0], n = 0;
        for (var yy = y0; yy < Math.max(y1, y0 + 1); yy++)
          for (var xx = x0; xx < Math.max(x1, x0 + 1); xx++) {
            var i = (yy * img.width + xx) * 4;
            acc[0] += img.data[i]; acc[1] += img.data[i + 1]; acc[2] += img.data[i + 2]; acc[3] += img.data[i + 3];
            n++;
          }
        var o = (y * w + x) * 4;
        out[o] = acc[0] / n; out[o + 1] = acc[1] / n; out[o + 2] = acc[2] / n; out[o + 3] = acc[3] / n;
      }
    }
    return { image: { width: w, height: h, data: out }, scale: s };
  }

  function applyColorVision(img, type) {
    var m = CVD[type];
    if (!m) throw new Error("모르는 색각이상 종류예요: " + type);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var r = toLinear[d[i]], g = toLinear[d[i + 1]], b = toLinear[d[i + 2]];
      d[i] = toSrgb(m[0] * r + m[1] * g + m[2] * b);
      d[i + 1] = toSrgb(m[3] * r + m[4] * g + m[5] * b);
      d[i + 2] = toSrgb(m[6] * r + m[7] * g + m[8] * b);
    }
    return img;
  }

  // 뿌옇게: 밝은 회색 안개와 섞어요 (amount 0~1)
  function applyContrastLoss(img, amount) {
    if (!amount) return img;
    var haze = 0.75; // 선형 밝기
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      for (var c = 0; c < 3; c++) d[i + c] = toSrgb(toLinear[d[i + c]] * (1 - amount) + haze * amount);
    }
    return img;
  }

  function applyLighting(img, level) {
    var f = LIGHTING[level];
    if (f == null) throw new Error("모르는 조명이에요: " + level);
    if (f === 1) return img;
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      for (var c = 0; c < 3; c++) d[i + c] = toSrgb(toLinear[d[i + c]] * f);
    }
    return img;
  }

  /*
   * 관람 거리와 시력으로 흐림 정도(가우스 시그마, px)를 계산해요.
   *   시력(소수 시력) 1.0 = 1분각을 구별, 0.1 = 10분각을 구별
   *   포스터 위 흐림 반경(mm) ≈ 0.5 × 거리(mm) × 구별 가능한 최소 각(라디안)
   * 근사식이에요. 같은 포스터를 시력 0.1인 사람이 볼 때와 1.0인 사람이 볼 때의 '차이'를 보여주는 용도예요.
   */
  function blurSigmaPx(distanceM, acuity, ppi) {
    if (!distanceM || !acuity || !ppi) return 0;
    var marRad = ((1 / acuity) / 60) * (Math.PI / 180);
    var sigmaMm = 0.5 * distanceM * 1000 * marRad;
    return (sigmaMm / 25.4) * ppi;
  }

  // 가우스 흐림을 상자 흐림 3번으로 근사 (빠름)
  function boxSizesForGauss(sigma, n) {
    var wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
    var wl = Math.floor(wIdeal);
    if (wl % 2 === 0) wl--;
    var wu = wl + 2;
    var mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
    var m = Math.round(mIdeal);
    var sizes = [];
    for (var i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
    return sizes;
  }

  // 한 방향 상자 흐림. 가장자리는 끝 픽셀을 늘려 써요.
  function boxBlurPass(src, dst, w, h, r, horizontal) {
    var len = horizontal ? w : h, lines = horizontal ? h : w;
    var step = horizontal ? 4 : w * 4; // 다음 픽셀까지 거리
    var inv = 1 / (r + r + 1);
    var last = len - 1;
    for (var line = 0; line < lines; line++) {
      var base = horizontal ? line * w * 4 : line * 4;
      for (var c = 0; c < 4; c++) {
        var o = base + c;
        var sum = 0;
        for (var k = -r - 1; k < r; k++) sum += src[o + (k < 0 ? 0 : k > last ? last : k) * step];
        for (var p = 0; p < len; p++) {
          var addK = p + r, subK = p - r - 1;
          sum += src[o + (addK > last ? last : addK) * step] - src[o + (subK < 0 ? 0 : subK) * step];
          dst[o + p * step] = sum * inv;
        }
      }
    }
  }

  function applyBlur(img, sigma) {
    if (!(sigma > 0.3)) return img;
    var w = img.width, h = img.height;
    var a = new Float32Array(img.data), b = new Float32Array(a.length);
    var sizes = boxSizesForGauss(sigma, 3);
    for (var i = 0; i < 3; i++) {
      var r = (sizes[i] - 1) / 2;
      boxBlurPass(a, b, w, h, r, true);
      boxBlurPass(b, a, w, h, r, false);
    }
    for (i = 0; i < a.length; i++) img.data[i] = a[i];
    return img;
  }

  // 백내장: 수정체가 누렇게 변해서 파란빛이 줄어들고 전체가 누렇게 보여요 (근사)
  function applyYellowing(img, amount) {
    var d = img.data, a = Math.min(1, Math.max(0, amount));
    var kr = 1, kg = 1 - 0.12 * a, kb = 1 - 0.55 * a;
    for (var i = 0; i < d.length; i += 4) {
      d[i] = d[i] * kr;
      d[i + 1] = d[i + 1] * kg;
      d[i + 2] = d[i + 2] * kb;
    }
    return img;
  }

  /*
   * opts: {
   *   colorVision: null | "protan" | "deutan" | "tritan",
   *   contrastLoss: 0~0.8,
   *   yellowing: 0~1 (백내장의 누런 빛),
   *   lighting: "normal" | "dim" | "dark",
   *   distanceM: 관람 거리(m), acuity: 소수 시력(예 1.0, 0.3, 0.1), ppi: 문서 해상도,
   *   maxWidth: 미리보기 최대 너비(px, 기본 1200)
   * }
   * 돌려주는 값: { image, scale, blurSigmaPx, description: [...] }
   */
  function simulate(img, opts) {
    opts = opts || {};
    var ds = downscale(img, opts.maxWidth || 1200);
    var out = ds.image;
    var desc = [];
    if (opts.colorVision) {
      applyColorVision(out, opts.colorVision);
      desc.push(LABELS.cvd[opts.colorVision]);
    }
    if (opts.contrastLoss) {
      applyContrastLoss(out, Math.min(0.9, Math.max(0, opts.contrastLoss)));
      desc.push("대비 저하 " + Math.round(opts.contrastLoss * 100) + "%");
    }
    if (opts.yellowing) {
      applyYellowing(out, opts.yellowing);
      desc.push("누렇게 보임");
    }
    if (opts.lighting && opts.lighting !== "normal") {
      applyLighting(out, opts.lighting);
      desc.push(LABELS.lighting[opts.lighting]);
    }
    var sigma = blurSigmaPx(opts.distanceM, opts.acuity, opts.ppi) * ds.scale;
    if (sigma > 0.3) {
      applyBlur(out, sigma);
      desc.push("시력 " + opts.acuity + " · " + opts.distanceM + "m 거리");
    }
    return { image: out, scale: ds.scale, blurSigmaPx: sigma, description: desc };
  }

  return {
    simulate: simulate,
    applyColorVision: applyColorVision,
    applyContrastLoss: applyContrastLoss,
    applyLighting: applyLighting,
    applyYellowing: applyYellowing,
    applyBlur: applyBlur,
    blurSigmaPx: blurSigmaPx,
    downscale: downscale,
    LABELS: LABELS,
    CVD_MATRICES: CVD
  };
});
