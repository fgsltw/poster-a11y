/*
 * psd-apply.js — 포토샵 없이 PSD 파일에 수정 제안을 적용해 '접근성 버전' PSD를 만듭니다.
 *
 * 하는 일
 *   - 글자 색 바꾸기          { layerId, type: "color", value: "#524D42" }
 *   - 글자 크기 바꾸기        { layerId, type: "size", valuePt: 18 }
 *   - 글자 뒤 배경 띠 넣기    { layerId, type: "backplate", color: "#FFFFFF", opacity: 0.85, paddingMm: 1.5 }
 *   - 굵게 (가짜 굵게)        { layerId, type: "weight", fauxBold: true }
 *   - 줄 간격·자간            { layerId, type: "spacing", lineHeight: 1.5, letterSpacingEm: 0 }
 *   - 레이어를 다시 합성해서 미리보기(합성 이미지)를 새로 만들기
 *
 * 원본 PSD 객체는 건드리지 않고 복사본을 고쳐서 돌려줘요.
 * 글자를 포토샵처럼 다시 그리지는 못해요. 대신 기존 글자 픽셀의 색을 바꾸거나 크기를 늘려서
 * 미리보기를 만들고, 파일을 포토샵에서 열면 포토샵이 글자를 새로 그리도록 표시해요
 * (writePsd 옵션 invalidateTextLayers: true).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../plugin/lib/layer-data.js"));
  else root.PsdApply = factory(root.LayerData);
})(typeof self !== "undefined" ? self : this, function (LD) {
  "use strict";

  var MM_PER_INCH = 25.4;

  function getPpi(psd) {
    var ri = psd.imageResources && psd.imageResources.resolutionInfo;
    if (!ri) return 72;
    return ri.horizontalResolutionUnit === "PPCM" ? ri.horizontalResolution * 2.54 : ri.horizontalResolution;
  }

  function clone(obj) {
    return typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
  }

  // 레이어 ID로 레이어와 그 레이어가 들어 있는 목록(부모)을 찾아요.
  function findLayer(list, id) {
    for (var i = 0; i < list.length; i++) {
      var l = list[i];
      if (l.id === id) return { layer: l, siblings: list, index: i };
      if (l.children) {
        var r = findLayer(l.children, id);
        if (r) return r;
      }
    }
    return null;
  }

  function maxId(list) {
    var m = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id > m) m = list[i].id;
      if (list[i].children) m = Math.max(m, maxId(list[i].children));
    }
    return m;
  }

  function transformScaleY(t) {
    if (!t || t.length < 4) return 1;
    return Math.sqrt(t[2] * t[2] + t[3] * t[3]) || 1;
  }

  function effectiveFontPx(text) {
    var runs = text.styleRuns || [];
    var size = text.style && text.style.fontSize;
    if (runs.length) {
      var best = runs[0];
      for (var i = 1; i < runs.length; i++) if (runs[i].length > best.length) best = runs[i];
      if (best.style.fontSize != null) size = best.style.fontSize;
    }
    return size == null ? null : size * transformScaleY(text.transform);
  }

  // ------------------------------------------------------------ 합성

  /*
   * 레이어를 아래부터 '표준(normal)' 혼합으로 다시 합성해요.
   * 혼합 모드·레이어 효과·조정 레이어·클리핑 마스크는 계산하지 않아요 → warnings 에 적어요.
   */
  function compositePsd(psd) {
    var W = psd.width, H = psd.height;
    var out = new Float32Array(W * H * 4); // 0~1, 프리멀티플라이드
    var warnings = [];

    function draw(layer, groupOpacity) {
      var img = layer.imageData;
      if (!img) return;
      var op = groupOpacity * (layer.opacity == null ? 1 : layer.opacity) * (layer.fillOpacity == null ? 1 : layer.fillOpacity);
      if (op <= 0) return;
      for (var y = 0; y < img.height; y++) {
        var dy = layer.top + y;
        if (dy < 0 || dy >= H) continue;
        for (var x = 0; x < img.width; x++) {
          var dx = layer.left + x;
          if (dx < 0 || dx >= W) continue;
          var si = (y * img.width + x) * 4;
          var a = (img.data[si + 3] / 255) * op;
          if (a <= 0) continue;
          var di = (dy * W + dx) * 4;
          var inv = 1 - a;
          out[di] = (img.data[si] / 255) * a + out[di] * inv;
          out[di + 1] = (img.data[si + 1] / 255) * a + out[di + 1] * inv;
          out[di + 2] = (img.data[si + 2] / 255) * a + out[di + 2] * inv;
          out[di + 3] = a + out[di + 3] * inv;
        }
      }
    }

    function walk(list, groupOpacity) {
      // ag-psd 순서: 아래 레이어부터
      for (var i = 0; i < list.length; i++) {
        var l = list[i];
        if (l.hidden) continue;
        var bm = l.blendMode || "normal";
        if (l.children) {
          if (bm !== "pass through" && bm !== "normal") warnings.push("그룹 '" + l.name + "'의 혼합 모드(" + bm + ")는 미리보기에 반영되지 않아요.");
          walk(l.children, groupOpacity * (l.opacity == null ? 1 : l.opacity));
          continue;
        }
        if (bm !== "normal") warnings.push("레이어 '" + l.name + "'의 혼합 모드(" + bm + ")는 미리보기에 반영되지 않아요.");
        if (l.clipping) warnings.push("레이어 '" + l.name + "'의 클리핑 마스크는 미리보기에 반영되지 않아요.");
        if (l.effects && Object.keys(l.effects).length) warnings.push("레이어 '" + l.name + "'의 레이어 효과는 미리보기에 반영되지 않아요.");
        if (l.adjustment) warnings.push("조정 레이어 '" + l.name + "'는 미리보기에 반영되지 않아요.");
        draw(l, groupOpacity);
      }
    }
    walk(psd.children || [], 1);

    var data = new Uint8ClampedArray(W * H * 4);
    for (var i = 0; i < W * H; i++) {
      var a = out[i * 4 + 3];
      if (a > 0) {
        data[i * 4] = Math.round((out[i * 4] / a) * 255);
        data[i * 4 + 1] = Math.round((out[i * 4 + 1] / a) * 255);
        data[i * 4 + 2] = Math.round((out[i * 4 + 2] / a) * 255);
      }
      data[i * 4 + 3] = Math.round(a * 255);
    }
    return { imageData: { width: W, height: H, data: data }, warnings: unique(warnings) };
  }

  // 두 이미지가 얼마나 다른지 (채널 평균 차이, 최대 차이)
  function compareImageData(a, b) {
    if (!a || !b || a.width !== b.width || a.height !== b.height) return null;
    var sum = 0, max = 0, n = a.data.length;
    for (var i = 0; i < n; i++) {
      var d = Math.abs(a.data[i] - b.data[i]);
      sum += d;
      if (d > max) max = d;
    }
    return { meanDiff: sum / n, maxDiff: max };
  }

  function unique(arr) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
    return out;
  }

  // ------------------------------------------------------------ 수정 하나하나

  function setTextStyle(text, fn) {
    if (text.style) fn(text.style);
    else text.style = {}, fn(text.style);
    (text.styleRuns || []).forEach(function (r) { fn(r.style); });
  }

  function applyColor(layer, hex, isCmyk) {
    var rgb = LD.hexToRgb(hex);
    if (!rgb) throw new Error("색 형식이 잘못됐어요: " + hex);
    var note = "";
    if (isCmyk) {
      // CMYK 문서에는 CMYK 글자색으로 넣어요. 디자이너가 보는 값처럼 % 단위로 반올림해요.
      var ink = LD.rgbToCmyk(rgb.r, rgb.g, rgb.b);
      var pct = LD.cmykPercent(ink);
      var printable = LD.cmykToRgb(pct.c / 100, pct.m / 100, pct.y / 100, pct.k / 100);
      setTextStyle(layer.text, function (s) {
        s.fillColor = { c: (pct.c / 100) * 255, m: (pct.m / 100) * 255, y: (pct.y / 100) * 255, k: (pct.k / 100) * 255 };
      });
      note = " (CMYK " + pct.c + "/" + pct.m + "/" + pct.y + "/" + pct.k + ")";
      if (ink.error > 6) note += " ⚠ 인쇄로 낼 수 없는 색이라 가장 가까운 색 " + LD.toHex(printable.r, printable.g, printable.b) + "로 바꿨어요";
      rgb = printable;
    } else {
      setTextStyle(layer.text, function (s) { s.fillColor = { r: rgb.r, g: rgb.g, b: rgb.b }; });
    }
    // 미리보기: 글자 모양(알파)은 그대로 두고 색만 바꿔요 → 정확해요
    var img = layer.imageData;
    if (img) {
      for (var i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3] === 0) continue;
        img.data[i] = rgb.r;
        img.data[i + 1] = rgb.g;
        img.data[i + 2] = rgb.b;
      }
    }
    return "글자색 → " + hex.toUpperCase() + note;
  }

  // 양선형 보간으로 크기를 바꿔요 (프리멀티플라이드로 계산해서 가장자리 색 번짐을 막아요)
  function resample(img, scale) {
    var nw = Math.max(1, Math.round(img.width * scale));
    var nh = Math.max(1, Math.round(img.height * scale));
    var out = new Uint8ClampedArray(nw * nh * 4);
    for (var y = 0; y < nh; y++) {
      var sy = (y + 0.5) / scale - 0.5;
      var y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(img.height - 1, y0 + 1), fy = Math.min(1, Math.max(0, sy - y0));
      for (var x = 0; x < nw; x++) {
        var sx = (x + 0.5) / scale - 0.5;
        var x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(img.width - 1, x0 + 1), fx = Math.min(1, Math.max(0, sx - x0));
        var acc = [0, 0, 0, 0];
        var pts = [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]];
        for (var k = 0; k < 4; k++) {
          var i = (pts[k][1] * img.width + pts[k][0]) * 4, w = pts[k][2], a = img.data[i + 3] / 255;
          acc[0] += img.data[i] * a * w;
          acc[1] += img.data[i + 1] * a * w;
          acc[2] += img.data[i + 2] * a * w;
          acc[3] += a * w;
        }
        var o = (y * nw + x) * 4;
        if (acc[3] > 0) {
          out[o] = acc[0] / acc[3];
          out[o + 1] = acc[1] / acc[3];
          out[o + 2] = acc[2] / acc[3];
        }
        out[o + 3] = acc[3] * 255;
      }
    }
    return { width: nw, height: nh, data: out };
  }

  function applySize(layer, valuePt, ppi) {
    var cur = effectiveFontPx(layer.text);
    if (!cur) throw new Error("현재 글자 크기를 알 수 없어요.");
    var targetPx = LD.ptToPx(valuePt, ppi);
    var factor = targetPx / cur;
    setTextStyle(layer.text, function (s) {
      if (s.fontSize != null) s.fontSize = s.fontSize * factor;
      if (s.leading != null) s.leading = s.leading * factor;
    });
    // 미리보기: 글자 기준점(베이스라인 왼쪽)을 중심으로 픽셀을 늘려요 → 근사치
    var t = layer.text.transform || [1, 0, 0, 1, layer.left, layer.bottom];
    var ox = t[4], oy = t[5];
    if (layer.imageData) {
      var img = resample(layer.imageData, factor);
      var left = Math.round(ox + (layer.left - ox) * factor);
      var top = Math.round(oy + (layer.top - oy) * factor);
      layer.imageData = img;
      layer.left = left;
      layer.top = top;
      layer.right = left + img.width;
      layer.bottom = top + img.height;
    }
    return "글자 크기 → " + LD.round(valuePt, 1) + "pt (×" + LD.round(factor, 2) + ")";
  }

  // 굵게: 포토샵 '가짜 굵게(Faux Bold)'를 켜요. 미리보기는 글자 모양을 조금 두껍게(팽창) 그려서 근사해요.
  function applyWeight(layer) {
    setTextStyle(layer.text, function (s) { s.fauxBold = true; });
    var img = layer.imageData;
    var px = effectiveFontPx(layer.text) || 20;
    var r = Math.max(1, Math.round(px * 0.025));
    if (img) {
      var W = img.width, H = img.height, nw = W + 2 * r, nh = H + 2 * r;
      var out = new Uint8ClampedArray(nw * nh * 4);
      for (var y = 0; y < nh; y++) {
        for (var x = 0; x < nw; x++) {
          var best = -1, bi = 0;
          for (var dy = -r; dy <= r; dy++) {
            var sy = y - r + dy;
            if (sy < 0 || sy >= H) continue;
            for (var dx = -r; dx <= r; dx++) {
              if (dx * dx + dy * dy > r * r) continue;
              var sx = x - r + dx;
              if (sx < 0 || sx >= W) continue;
              var si = (sy * W + sx) * 4;
              if (img.data[si + 3] > best) { best = img.data[si + 3]; bi = si; }
            }
          }
          if (best <= 0) continue;
          var o = (y * nw + x) * 4;
          out[o] = img.data[bi]; out[o + 1] = img.data[bi + 1]; out[o + 2] = img.data[bi + 2]; out[o + 3] = best;
        }
      }
      layer.imageData = { width: nw, height: nh, data: out };
      layer.left -= r; layer.top -= r; layer.right = layer.left + nw; layer.bottom = layer.top + nh;
    }
    return "가짜 굵게(Faux Bold) 켜기 — 더 굵은 글꼴(Regular·Medium)로 바꾸면 더 좋아요";
  }

  // 줄 간격(글자 크기의 배수)·자간(em). 미리보기에는 반영하지 못해요 → 포토샵에서 열면 반영돼요.
  function applySpacing(layer, fix) {
    var parts = [];
    var base = layer.text.style && layer.text.style.fontSize;
    setTextStyle(layer.text, function (s) {
      var size = s.fontSize != null ? s.fontSize : base;
      if (fix.lineHeight != null && size) { s.autoLeading = false; s.leading = size * fix.lineHeight; }
      if (fix.letterSpacingEm != null) s.tracking = Math.round(fix.letterSpacingEm * 1000);
    });
    if (fix.lineHeight != null) parts.push("줄 간격 → 글자 크기의 " + fix.lineHeight + "배");
    if (fix.letterSpacingEm != null) parts.push("자간 → " + Math.round(fix.letterSpacingEm * 1000) + " (" + fix.letterSpacingEm + "em)");
    if (!parts.length) throw new Error("lineHeight 나 letterSpacingEm 이 필요해요.");
    return parts.join(", ");
  }

  // 글자 크기를 키운 뒤: 포스터 밖으로 나가거나 다른 글자와 겹치는지
  function layoutWarnings(psd, sizedIds) {
    var texts = [];
    (function walk(list) {
      list.forEach(function (l) {
        if (l.children) walk(l.children);
        else if (l.text && !l.hidden && l.right > l.left) texts.push(l);
      });
    })(psd.children || []);
    var out = [];
    texts.forEach(function (l) {
      if (sizedIds.indexOf(l.id) < 0) return;
      var name = "'" + (l.name || l.id) + "'";
      if (l.left < 0 || l.top < 0 || l.right > psd.width || l.bottom > psd.height) out.push(name + " 글자를 키웠더니 포스터 밖으로 나가요. 위치를 옮기거나 여러 줄로 나눠 주세요.");
      texts.forEach(function (o) {
        if (o === l) return;
        var w = Math.min(l.right, o.right) - Math.max(l.left, o.left), h = Math.min(l.bottom, o.bottom) - Math.max(l.top, o.top);
        if (w > 2 && h > 2) out.push(name + " 글자를 키웠더니 '" + (o.name || o.id) + "'와(과) 겹쳐요. 위치나 간격을 조정해 주세요.");
      });
    });
    return out;
  }

  function applyBackplate(found, fix, ppi, newId, isCmyk) {
    var layer = found.layer;
    var rgb = LD.hexToRgb(fix.color || "#FFFFFF");
    if (!rgb) throw new Error("배경 띠 색 형식이 잘못됐어요: " + fix.color);
    if (isCmyk) {
      // 저장할 때 CMYK로 바뀌니까 인쇄로 낼 수 있는 색으로 미리 맞춰요
      var pct = LD.cmykPercent(LD.rgbToCmyk(rgb.r, rgb.g, rgb.b));
      rgb = LD.cmykToRgb(pct.c / 100, pct.m / 100, pct.y / 100, pct.k / 100);
    }
    var opacity = fix.opacity == null ? 0.85 : fix.opacity;
    var pad = Math.round(((fix.paddingMm == null ? 1.5 : fix.paddingMm) / MM_PER_INCH) * ppi);
    var left = layer.left - pad, top = layer.top - pad, right = layer.right + pad, bottom = layer.bottom + pad;
    var w = right - left, h = bottom - top;
    var data = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < w * h; i++) {
      data[i * 4] = rgb.r;
      data[i * 4 + 1] = rgb.g;
      data[i * 4 + 2] = rgb.b;
      data[i * 4 + 3] = 255;
    }
    var plate = {
      id: newId,
      name: "접근성 배경 띠 · " + (layer.name || layer.id),
      left: left, top: top, right: right, bottom: bottom,
      opacity: opacity,
      blendMode: "normal",
      imageData: { width: w, height: h, data: data }
    };
    // ag-psd 목록은 아래부터라서, 글자 레이어 바로 앞에 넣으면 '바로 아래'가 돼요
    found.siblings.splice(found.index, 0, plate);
    return { message: "배경 띠 추가 (" + (fix.color || "#FFFFFF").toUpperCase() + ", " + Math.round(opacity * 100) + "%, 여백 " + pad + "px)", layerId: newId };
  }

  // ------------------------------------------------------------ 전체

  /*
   * fixes: [{ layerId, type, ... }]  — 형식은 docs/apply-fixes.md
   * 돌려주는 값: { psd, applied: [...], skipped: [...], warnings: [...], previewMatchesOriginal }
   */
  function applyFixes(originalPsd, fixes, opts) {
    opts = opts || {};
    var psd = clone(originalPsd);
    var ppi = getPpi(psd);
    var applied = [], skipped = [], warnings = [];

    // 미리보기를 믿을 수 있는지: 원본을 다시 합성해서 저장된 합성 이미지와 비교
    var recomposed = compositePsd(psd);
    var cmp = compareImageData(recomposed.imageData, psd.imageData);
    var previewMatchesOriginal = cmp ? cmp.meanDiff < 2 : null;
    if (cmp && !previewMatchesOriginal) warnings.push("이 PSD는 다시 합성한 결과가 원본과 달라요 (평균 차이 " + LD.round(cmp.meanDiff, 1) + "). 미리보기는 참고용이에요.");
    warnings = warnings.concat(recomposed.warnings);

    var nextId = maxId(psd.children || []) + 1;
    var sizedIds = [], spacingNote = false;
    // 배경 띠는 레이어 순서를 바꾸니까 맨 마지막에 처리해요
    var ordered = fixes.filter(function (f) { return f.type !== "backplate"; }).concat(fixes.filter(function (f) { return f.type === "backplate"; }));

    for (var i = 0; i < ordered.length; i++) {
      var f = ordered[i];
      var found = findLayer(psd.children || [], f.layerId);
      if (!found) { skipped.push({ fix: f, reason: "레이어를 찾지 못했어요." }); continue; }
      if (!found.layer.text) { skipped.push({ fix: f, reason: "텍스트 레이어가 아니에요." }); continue; }
      try {
        if (f.type === "color") applied.push({ fix: f, message: applyColor(found.layer, f.value, psd.colorMode === 4) });
        else if (f.type === "size") { applied.push({ fix: f, message: applySize(found.layer, f.valuePt, ppi) }); sizedIds.push(f.layerId); }
        else if (f.type === "weight") applied.push({ fix: f, message: applyWeight(found.layer) });
        else if (f.type === "spacing") {
          applied.push({ fix: f, message: applySpacing(found.layer, f) });
          spacingNote = true;
        }
        else if (f.type === "backplate") {
          var r = applyBackplate(found, f, ppi, nextId++, psd.colorMode === 4);
          applied.push({ fix: f, message: r.message, createdLayerId: r.layerId });
        } else skipped.push({ fix: f, reason: "모르는 수정 종류예요: " + f.type });
      } catch (e) {
        skipped.push({ fix: f, reason: e.message });
      }
    }

    if (spacingNote) warnings.push("줄 간격·자간 변경은 미리보기에 보이지 않아요. 포토샵에서 파일을 열면 반영돼요.");
    warnings = warnings.concat(layoutWarnings(psd, sizedIds));
    psd.imageData = compositePsd(psd).imageData;
    return { psd: psd, applied: applied, skipped: skipped, warnings: warnings, previewMatchesOriginal: previewMatchesOriginal };
  }

  // 결과 PSD를 쓸 때 쓰는 옵션: 포토샵이 열 때 글자를 새로 그리게 해요.
  var WRITE_OPTIONS = { invalidateTextLayers: true };

  return {
    applyFixes: applyFixes,
    compositePsd: compositePsd,
    compareImageData: compareImageData,
    findLayer: findLayer,
    WRITE_OPTIONS: WRITE_OPTIONS
  };
});
