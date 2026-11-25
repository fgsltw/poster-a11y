/*
 * psd-apply.js — 포토샵 없이 PSD 파일에 수정 제안을 적용해 '접근성 버전' PSD를 만듭니다.
 *
 * 하는 일
 *   - 글자 색 바꾸기          { layerId, type: "color", value: "#524D42" }
 *     (색 구간만)             { layerId, type: "color", value: "#524D42", runs: [{ from: "#8A8478", value: "#524D42" }] }
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

  /*
   * PSD 객체 깊은 복사.
   * 포토샵에서 저장한 PSD는 썸네일 등이 브라우저 canvas 로 읽혀서 structuredClone 이 실패해요
   * ("HTMLCanvasElement object could not be cloned"). 그런 객체는 복사하지 않고 그대로 같이 써요 (수정하지 않는 부분이에요).
   */
  function clone(obj) {
    if (typeof structuredClone === "function") {
      try { return structuredClone(obj); } catch (e) { /* 아래 방법으로 */ }
    }
    return deepCopy(obj);
  }
  function deepCopy(v) {
    if (v === null || typeof v !== "object") return v;
    if (ArrayBuffer.isView(v)) return v.slice();
    if (v instanceof ArrayBuffer) return v.slice(0);
    if (v instanceof Date) return new Date(v.getTime());
    if (Array.isArray(v)) return v.map(deepCopy);
    var proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v; // canvas, ImageBitmap 같은 브라우저 객체
    var out = {};
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = deepCopy(v[k]);
    return out;
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
   * region { left, top, right, bottom } 을 주면 그 부분만 합성해요 (항목별 전후 미리보기를 빠르게 만들 때).
   */
  function compositePsd(psd, region) {
    var ox = region ? Math.max(0, Math.floor(region.left)) : 0;
    var oy = region ? Math.max(0, Math.floor(region.top)) : 0;
    var W = region ? Math.min(psd.width, Math.ceil(region.right)) - ox : psd.width;
    var H = region ? Math.min(psd.height, Math.ceil(region.bottom)) - oy : psd.height;
    W = Math.max(1, W); H = Math.max(1, H);
    var out = new Float32Array(W * H * 4); // 0~1, 프리멀티플라이드
    var warnings = [];

    function draw(layer, groupOpacity) {
      var img = layer.imageData;
      if (!img) return;
      var op = groupOpacity * (layer.opacity == null ? 1 : layer.opacity) * (layer.fillOpacity == null ? 1 : layer.fillOpacity);
      if (op <= 0) return;
      // 결과 영역과 겹치는 부분만 돌아요
      var y0 = Math.max(0, oy - layer.top), y1 = Math.min(img.height, oy + H - layer.top);
      var x0 = Math.max(0, ox - layer.left), x1 = Math.min(img.width, ox + W - layer.left);
      for (var y = y0; y < y1; y++) {
        var dy = layer.top + y - oy;
        for (var x = x0; x < x1; x++) {
          var dx = layer.left + x - ox;
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

  // 글자 스타일의 채우기 색 → RGB hex (psd-extract 의 colorToHex 와 같은 계산)
  function fillHex(c) {
    if (!c) return null;
    if ("c" in c && "m" in c && "y" in c && "k" in c) {
      var x = LD.cmykToRgb(c.c / 255, c.m / 255, c.y / 255, c.k / 255);
      return LD.toHex(x.r, x.g, x.b).toUpperCase();
    }
    if ("r" in c && "g" in c && "b" in c) return LD.toHex(c.r, c.g, c.b).toUpperCase();
    if ("fr" in c) {
      var s = c.fr > 1 || c.fg > 1 || c.fb > 1 ? 1 : 255;
      return LD.toHex(c.fr * s, c.fg * s, c.fb * s).toUpperCase();
    }
    return null;
  }

  // 넣을 색 준비: CMYK 문서에는 CMYK 글자색으로 (디자이너가 보는 값처럼 % 단위로 반올림)
  function prepareColor(hex, isCmyk) {
    var rgb = LD.hexToRgb(hex);
    if (!rgb) throw new Error("색 형식이 잘못됐어요: " + hex);
    if (!isCmyk) return { fill: { r: rgb.r, g: rgb.g, b: rgb.b }, rgb: rgb, note: "" };
    var ink = LD.rgbToCmyk(rgb.r, rgb.g, rgb.b);
    var pct = LD.cmykPercent(ink);
    var printable = LD.cmykToRgb(pct.c / 100, pct.m / 100, pct.y / 100, pct.k / 100);
    var note = " (CMYK " + pct.c + "/" + pct.m + "/" + pct.y + "/" + pct.k + ")";
    if (ink.error > 6) note += " ⚠ 인쇄로 낼 수 없는 색이라 가장 가까운 색 " + LD.toHex(printable.r, printable.g, printable.b) + "로 바꿨어요";
    return { fill: { c: (pct.c / 100) * 255, m: (pct.m / 100) * 255, y: (pct.y / 100) * 255, k: (pct.k / 100) * 255 }, rgb: printable, note: note };
  }

  /*
   * fix.value 만 있으면 글자 전체를 그 색으로,
   * fix.runs: [{ from: "#8A8478", value: "#6F6A5E" }] 가 있으면 그 색 구간만 바꾸고 나머지(강조색 등)는 그대로 둬요.
   */
  function applyColor(layer, fix, isCmyk) {
    var img = layer.imageData;
    if (!fix.runs || !fix.runs.length) {
      var one = prepareColor(fix.value, isCmyk);
      setTextStyle(layer.text, function (s) { s.fillColor = one.fill; });
      // 미리보기: 글자 모양(알파)은 그대로 두고 색만 바꿔요 → 정확해요
      if (img) {
        for (var i = 0; i < img.data.length; i += 4) {
          if (img.data[i + 3] === 0) continue;
          img.data[i] = one.rgb.r;
          img.data[i + 1] = one.rgb.g;
          img.data[i + 2] = one.rgb.b;
        }
      }
      return "글자색 → " + fix.value.toUpperCase() + one.note;
    }

    // 색 구간별로 바꾸기
    var map = {};
    fix.runs.forEach(function (r) { map[String(r.from).toUpperCase()] = { value: r.value.toUpperCase(), to: prepareColor(r.value, isCmyk) }; });
    // 바꾸기 전 글자에 있던 색들 (미리보기에서 픽셀이 어느 색 구간인지 고를 때 써요)
    var palette = [];
    setTextStyle(layer.text, function (s) {
      var h = fillHex(s.fillColor);
      if (h && palette.indexOf(h) < 0) palette.push(h);
    });
    var matched = {};
    setTextStyle(layer.text, function (s) {
      var h = fillHex(s.fillColor);
      if (h && map[h]) { s.fillColor = map[h].to.fill; matched[h] = true; }
    });
    var missing = Object.keys(map).filter(function (h) { return !matched[h]; });
    if (missing.length === Object.keys(map).length) throw new Error("바꿀 색 구간을 찾지 못했어요: " + missing.join(", "));

    // 미리보기: 픽셀마다 가장 가까운 원래 색을 찾아서, 바꾸는 색이면 새 색으로 (안티앨리어싱은 알파라서 색은 그대로예요)
    if (img) {
      var pal = palette.map(function (h) { return { hex: h, rgb: LD.hexToRgb(h) }; });
      for (var j = 0; j < img.data.length; j += 4) {
        if (img.data[j + 3] === 0) continue;
        var best = null, bd = Infinity;
        for (var k = 0; k < pal.length; k++) {
          var dr = img.data[j] - pal[k].rgb.r, dg = img.data[j + 1] - pal[k].rgb.g, db = img.data[j + 2] - pal[k].rgb.b;
          var d = dr * dr + dg * dg + db * db;
          if (d < bd) { bd = d; best = pal[k].hex; }
        }
        var m = best && map[best];
        if (!m) continue;
        img.data[j] = m.to.rgb.r;
        img.data[j + 1] = m.to.rgb.g;
        img.data[j + 2] = m.to.rgb.b;
      }
    }
    var kept = palette.filter(function (h) { return !map[h]; });
    return "글자색 " + Object.keys(matched).map(function (h) { return h + " → " + map[h].value + map[h].to.note; }).join(", ") +
      (kept.length ? " (그대로 둔 색: " + kept.join(", ") + ")" : "") +
      (missing.length ? " ⚠ 찾지 못한 색: " + missing.join(", ") : "");
  }

  // ------------------------------------------------------------ 색만 다른 강조 → 모양으로도 (굵게 + 밑줄, 밝기)
  //   fix.runs: [{ from: "#C62828", bold: true, underline: true, value?: "#7F1616" }]
  //   PSD: 그 색 구간의 글자 스타일에 가짜 굵게·밑줄(·색)을 켜요
  //   미리보기: 그 색 픽셀만 조금 두껍게 그리고, 그 구간 아래에 밑줄을 그어요 (근사)
  function applyEmphasis(layer, fix, isCmyk) {
    var map = {};
    (fix.runs || []).forEach(function (r) { map[String(r.from).toUpperCase()] = { run: r, to: r.value ? prepareColor(r.value, isCmyk) : null }; });
    var runs = layer.text.styleRuns || [];
    if (!runs.length) throw new Error("글자 구간(스타일)이 하나뿐이라 강조 구간을 찾을 수 없어요.");
    var palette = [];
    setTextStyle(layer.text, function (s) { var h = fillHex(s.fillColor); if (h && palette.indexOf(h) < 0) palette.push(h); });
    var hit = 0;
    runs.forEach(function (r) {
      var h = fillHex(r.style && r.style.fillColor), m = h && map[h];
      if (!m) return;
      if (m.run.bold) r.style.fauxBold = true;
      if (m.run.underline) r.style.underline = true;
      if (m.to) r.style.fillColor = m.to.fill;
      hit++;
    });
    if (!hit) throw new Error("강조할 색 구간을 찾지 못했어요: " + Object.keys(map).join(", "));

    var img = layer.imageData;
    if (img) {
      // 미리보기 그림: 강조 색마다 따로 (색이 여럿이면 굵게·밑줄도 색마다 다를 수 있어요)
      var pal = palette.map(function (h) { return { hex: h, rgb: LD.hexToRgb(h) }; });
      var W = img.width, H = img.height, masks = {};
      for (var p = 0; p < W * H; p++) {
        var j = p * 4;
        if (img.data[j + 3] === 0) continue;
        var best = null, bd = Infinity;
        for (var k = 0; k < pal.length; k++) {
          var dr = img.data[j] - pal[k].rgb.r, dg = img.data[j + 1] - pal[k].rgb.g, db = img.data[j + 2] - pal[k].rgb.b, d = dr * dr + dg * dg + db * db;
          if (d < bd) { bd = d; best = pal[k].hex; }
        }
        if (best && map[best]) {
          var M = masks[best] || (masks[best] = { mask: new Uint8Array(W * H), minX: W, maxX: -1, maxY: -1 });
          M.mask[p] = 1;
          var x = p % W, y = (p / W) | 0;
          if (x < M.minX) M.minX = x; if (x > M.maxX) M.maxX = x; if (y > M.maxY) M.maxY = y;
        }
      }
      var px = effectiveFontPx(layer.text) || 20;
      var colorOf = function (h) { return map[h].to ? map[h].to.rgb : LD.hexToRgb(map[h].run.from); };
      // 굵게(또는 색만 바꾸기): 원래 그림을 기준으로 강조 색 픽셀 주변을 같은 색으로 채워요
      var src = new Uint8ClampedArray(img.data);
      Object.keys(masks).forEach(function (h) {
        var M = masks[h], m = map[h], col = colorOf(h);
        if (m.run.bold) {
          var rr = Math.max(1, Math.round(px * 0.025));
          for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
            var a = 0;
            for (var dy = -rr; dy <= rr; dy++) for (var dx = -rr; dx <= rr; dx++) {
              var sx = x2 + dx, sy = y2 + dy;
              if (sx < 0 || sy < 0 || sx >= W || sy >= H || dx * dx + dy * dy > rr * rr || !M.mask[sy * W + sx]) continue;
              a = Math.max(a, src[(sy * W + sx) * 4 + 3]);
            }
            var o = (y2 * W + x2) * 4;
            if (a > img.data[o + 3] || (a && M.mask[y2 * W + x2])) { img.data[o] = col.r; img.data[o + 1] = col.g; img.data[o + 2] = col.b; img.data[o + 3] = Math.max(a, img.data[o + 3]); }
          }
        } else if (m.to) {
          for (var q = 0; q < W * H; q++) if (M.mask[q]) { img.data[q * 4] = col.r; img.data[q * 4 + 1] = col.g; img.data[q * 4 + 2] = col.b; }
        }
      });
      // 밑줄: 강조 색마다 그 구간 아래 (글자 크기의 8% 띄우고 6% 굵기). 그림 밖이면 그림을 아래로 늘려요
      Object.keys(masks).forEach(function (h) {
        var M = masks[h], col = colorOf(h);
        if (!map[h].run.underline) return;
        var gap = Math.max(2, Math.round(px * 0.08)), th = Math.max(2, Math.round(px * 0.06));
        var y0 = M.maxY + gap, need = y0 + th - img.height;
        if (need > 0) {
          var grown = new Uint8ClampedArray(W * (img.height + need) * 4);
          grown.set(img.data);
          layer.imageData = img = { width: W, height: img.height + need, data: grown };
          layer.bottom = layer.top + img.height;
        }
        for (var yy = y0; yy < y0 + th; yy++) for (var xx = M.minX; xx <= M.maxX; xx++) {
          var u = (yy * W + xx) * 4;
          img.data[u] = col.r; img.data[u + 1] = col.g; img.data[u + 2] = col.b; img.data[u + 3] = 255;
        }
      });
    }
    return "강조 구간 " + (fix.runs || []).map(function (r) {
      return String(r.from).toUpperCase() + " " + [r.bold ? "굵게" : "", r.underline ? "밑줄" : "", r.value ? "색 " + r.value.toUpperCase() : ""].filter(Boolean).join("·");
    }).join(" / ");
  }

  // ------------------------------------------------------------ 핵심 정보 띠 (좁은 시야)
  //   흩어진 핵심 정보를 모은 새 글자 레이어 + 흰 판을 맨 위에 넣어요. 원래 글자는 그대로 둬요.
  //   opts.renderText(text, px, colorHex, fontName) → { width, height, data } 가 있으면 미리보기 그림을 그려요
  //   (포토샵에서는 invalidateTextLayers 로 글자를 새로 그려요 — 여러 줄 처리는 확인 필요)
  function applyInfoStrip(psd, fix, ppi, newId, isCmyk, opts) {
    var px = LD.ptToPx(fix.sizePt, ppi);
    var pad = Math.round(((fix.paddingMm == null ? 2 : fix.paddingMm) / MM_PER_INCH) * ppi);
    var color = prepareColor(fix.color || "#111111", isCmyk);
    var plateRgb = LD.hexToRgb(fix.plate || "#FFFFFF");
    if (isCmyk) { var pc = LD.cmykPercent(LD.rgbToCmyk(plateRgb.r, plateRgb.g, plateRgb.b)); plateRgb = LD.cmykToRgb(pc.c / 100, pc.m / 100, pc.y / 100, pc.k / 100); }
    var lines = String(fix.text).split(/\r?\n|\r/), lineH = Math.round(px * 1.35);
    var img = opts && opts.renderText ? opts.renderText(fix.text, px, LD.toHex(color.rgb.r, color.rgb.g, color.rgb.b), fix.fontName) : null;
    var w = img ? img.width : Math.round(fix.widthPx || px * 10), h = img ? img.height : lineH * lines.length;
    var left = fix.left, top = fix.top;
    var textLayer = {
      id: newId + 1,
      name: "핵심 정보 띠 (접근성)",
      left: left, top: top, right: left + w, bottom: top + h,
      opacity: 1, blendMode: "normal",
      imageData: img || { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) },
      text: {
        text: lines.join("\r"), // 포토샵 문단 나눔은 \r (여러 줄 표시는 포토샵에서 확인 필요)
        transform: [1, 0, 0, 1, left, top + Math.round(px * 1.05)],
        style: { font: { name: fix.fontName || "MalgunGothic" }, fontSize: px, fillColor: color.fill, fauxBold: false, leading: lineH, autoLeading: false }
      }
    };
    var pl = left - pad, pt = top - pad, pw = w + pad * 2, ph = h + pad * 2, data = new Uint8ClampedArray(pw * ph * 4);
    for (var i = 0; i < pw * ph; i++) { data[i * 4] = plateRgb.r; data[i * 4 + 1] = plateRgb.g; data[i * 4 + 2] = plateRgb.b; data[i * 4 + 3] = 255; }
    var plate = { id: newId, name: "핵심 정보 띠 판 (접근성)", left: pl, top: pt, right: pl + pw, bottom: pt + ph, opacity: fix.plateOpacity == null ? 0.95 : fix.plateOpacity, blendMode: "normal", imageData: { width: pw, height: ph, data: data } };
    psd.children = psd.children || [];
    psd.children.push(plate, textLayer); // ag-psd 목록 끝 = 맨 위
    return { message: "핵심 정보 띠 추가 (" + lines.length + "줄, " + LD.round(fix.sizePt, 1) + "pt" + (img ? "" : ", 미리보기 그림 없음") + ")", layerId: textLayer.id, plateId: plate.id };
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

  // 글꼴 바꾸기: 모든 글자 구간의 글꼴을 fix.postScriptName 으로 (fix.upright 면 가짜 기울임도 꺼요).
  //   포토샵에 그 글꼴이 설치돼 있어야 제대로 보여요 (엔진은 설치돼 있을 때만 이 수정을 만들어요).
  //   미리보기: opts.renderText 가 있고 글자색이 하나면 새 글꼴로 글자 그림을 다시 그려요 → 근사치 (정렬·줄 간격은 대략)
  function applyFont(layer, fix, opts) {
    if (!fix.postScriptName) throw new Error("바꿀 글꼴 이름(postScriptName)이 필요해요.");
    var colors = [];
    setTextStyle(layer.text, function (s) {
      s.font = { name: fix.postScriptName };
      if (fix.upright) s.fauxItalic = false;
      var h = fillHex(s.fillColor);
      if (h && colors.indexOf(h) < 0) colors.push(h);
    });
    var label = (fix.family || fix.postScriptName) + (fix.weight ? " " + fix.weight : "");
    var px = effectiveFontPx(layer.text);
    var img = null;
    if (opts && opts.renderText && layer.imageData && px && colors.length <= 1) {
      img = opts.renderText(String(layer.text.text || ""), px, colors[0] || "#000000", fix.postScriptName, { cssFamilies: fix.cssFamilies || [], weight: fix.weight || "regular" });
    }
    if (!img) return { message: "글꼴 → " + label + " (미리보기에는 반영 안 됨, 포토샵에서 열면 반영돼요)", redrawn: false };
    // 글자 기준점(첫 줄 베이스라인 왼쪽)에 맞춰 놓아요. renderText 는 첫 줄 베이스라인을 px × 1.05 에 그려요
    var t = layer.text.transform || [1, 0, 0, 1, layer.left, layer.bottom];
    layer.imageData = img;
    layer.left = Math.round(t[4]);
    layer.top = Math.round(t[5] - px * 1.05);
    layer.right = layer.left + img.width;
    layer.bottom = layer.top + img.height;
    return { message: "글꼴 → " + label + " (미리보기는 근사치)", redrawn: true };
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

  // 글자 크기를 키운 뒤(또는 글꼴을 바꿔 폭이 달라진 뒤): 포스터 밖으로 나가거나 다른 글자와 겹치는지
  //   changed: [레이어 id] (모두 '키웠더니') 또는 { 레이어 id: "글꼴을 바꿨더니" ... }
  function layoutWarnings(psd, changed) {
    var verbOf = {};
    if (Array.isArray(changed)) changed.forEach(function (id) { verbOf[id] = "키웠더니"; });
    else Object.keys(changed || {}).forEach(function (id) { verbOf[id] = changed[id]; });
    var texts = [];
    (function walk(list) {
      list.forEach(function (l) {
        if (l.children) walk(l.children);
        else if (l.text && !l.hidden && l.right > l.left) texts.push(l);
      });
    })(psd.children || []);
    var out = [];
    texts.forEach(function (l) {
      var verb = verbOf[l.id];
      if (!verb) return;
      var name = "'" + (l.name || l.id) + "'";
      if (l.left < 0 || l.top < 0 || l.right > psd.width || l.bottom > psd.height) out.push(name + " 글자를 " + verb + " 포스터 밖으로 나가요. 위치를 옮기거나 여러 줄로 나눠 주세요.");
      texts.forEach(function (o) {
        if (o === l) return;
        var w = Math.min(l.right, o.right) - Math.max(l.left, o.left), h = Math.min(l.bottom, o.bottom) - Math.max(l.top, o.top);
        if (w > 2 && h > 2) out.push(name + " 글자를 " + verb + " '" + (o.name || o.id) + "'와(과) 겹쳐요. 위치나 간격을 조정해 주세요.");
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
    // opts.quick: 원본 비교와 전체 합성을 건너뛰어요 (항목별 미리보기용. 결과 psd.imageData 는 원본 그대로)
    var recomposed = opts.quick ? { imageData: null, warnings: [] } : compositePsd(psd);
    var cmp = compareImageData(recomposed.imageData, psd.imageData);
    var previewMatchesOriginal = cmp ? cmp.meanDiff < 2 : null;
    if (cmp && !previewMatchesOriginal) warnings.push("이 PSD는 다시 합성한 결과가 원본과 달라요 (평균 차이 " + LD.round(cmp.meanDiff, 1) + "). 미리보기는 참고용이에요.");
    warnings = warnings.concat(recomposed.warnings);

    var nextId = maxId(psd.children || []) + 1;
    var sizedIds = [], changedIds = {}, spacingNote = false;
    // 배경 띠는 레이어 순서를 바꾸니까 맨 마지막에, 핵심 정보 띠는 맨 위에 새로 넣으니까 그다음에 처리해요
    var late = { backplate: 1, infoStrip: 2 };
    // 강조(굵게·밑줄)는 원래 글자색으로 구간을 찾으니까, 글자색을 바꾸기 전에 먼저 처리해요
    //   (같은 글자에 글자색 수정이 함께 있으면, 색이 먼저 바뀌어 강조할 구간을 못 찾았어요)
    var ordered = fixes.filter(function (f) { return f.type === "emphasis"; })
      .concat(fixes.filter(function (f) { return !late[f.type] && f.type !== "emphasis"; }))
      .concat(fixes.filter(function (f) { return f.type === "backplate"; }), fixes.filter(function (f) { return f.type === "infoStrip"; }));

    for (var i = 0; i < ordered.length; i++) {
      var f = ordered[i];
      if (f.type === "infoStrip") {
        try {
          var s = applyInfoStrip(psd, f, ppi, nextId, psd.colorMode === 4, opts);
          nextId += 2;
          applied.push({ fix: f, message: s.message, createdLayerId: s.layerId });
        } catch (e) { skipped.push({ fix: f, reason: e.message }); }
        continue;
      }
      var found = findLayer(psd.children || [], f.layerId);
      if (!found) { skipped.push({ fix: f, reason: "레이어를 찾지 못했어요." }); continue; }
      if (!found.layer.text) { skipped.push({ fix: f, reason: "텍스트 레이어가 아니에요." }); continue; }
      try {
        if (f.type === "color") applied.push({ fix: f, message: applyColor(found.layer, f, psd.colorMode === 4) });
        else if (f.type === "size") { applied.push({ fix: f, message: applySize(found.layer, f.valuePt, ppi) }); sizedIds.push(f.layerId); }
        else if (f.type === "weight") applied.push({ fix: f, message: applyWeight(found.layer) });
        else if (f.type === "font") {
          var fr = applyFont(found.layer, f, opts);
          applied.push({ fix: f, message: fr.message });
          if (fr.redrawn) changedIds[f.layerId] = "글꼴을 바꿨더니";
        }
        else if (f.type === "emphasis") applied.push({ fix: f, message: applyEmphasis(found.layer, f, psd.colorMode === 4) });
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
    sizedIds.forEach(function (id) { changedIds[id] = "키웠더니"; });
    warnings = warnings.concat(layoutWarnings(psd, changedIds));
    if (!opts.quick) psd.imageData = compositePsd(psd).imageData;
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
