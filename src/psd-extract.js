/*
 * psd-extract.js — PSD 파일(ag-psd로 읽은 결과)에서 공통 레이어 데이터를 뽑습니다.
 * 포토샵이 없어도 동작해서, 검사 엔진(B)과 패널 화면(C)의 테스트 데이터를 만드는 데 씁니다.
 *
 * 사용법
 *   Node:    const { extractFromPsd } = require("./psd-extract.js");
 *            const psd = agPsd.readPsd(buffer, { useImageData: true });
 *            const data = extractFromPsd(psd, { fileName: "poster.psd" });
 *   브라우저: <script src="layer-data.js"> 다음에 <script src="psd-extract.js"> → window.PsdExtract
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("../plugin/lib/layer-data.js"), require("../plugin/lib/purpose-store.js"));
  else root.PsdExtract = factory(root.LayerData, root.PurposeStore);
})(typeof self !== "undefined" ? self : this, function (LD, PS) {
  "use strict";

  // 글자색이 어떤 색 공간에서 왔는지 (CMYK 원래 값은 디자이너가 보는 % 그대로 남겨요)
  function colorSourceOf(c) {
    if (!c) return null;
    if ("c" in c && "m" in c && "y" in c && "k" in c) {
      return { space: "cmyk", cmyk: LD.cmykPercent({ c: c.c / 255, m: c.m / 255, y: c.y / 255, k: c.k / 255 }) };
    }
    if ("r" in c || "fr" in c) return { space: "rgb" };
    if ("k" in c) return { space: "grayscale" };
    return { space: "unknown" };
  }

  function colorToHex(c) {
    if (!c) return null;
    if ("c" in c && "m" in c && "y" in c && "k" in c) {
      // ag-psd 는 CMYK 글자색을 잉크 양 0~255 로 줘요
      var rgb = LD.cmykToRgb(c.c / 255, c.m / 255, c.y / 255, c.k / 255);
      return LD.toHex(rgb.r, rgb.g, rgb.b);
    }
    if ("r" in c && "g" in c && "b" in c) return LD.toHex(c.r, c.g, c.b);
    if ("fr" in c) {
      // ag-psd FRGB 는 0~1 범위
      var s = c.fr > 1 || c.fg > 1 || c.fb > 1 ? 1 : 255;
      return LD.toHex(c.fr * s, c.fg * s, c.fb * s);
    }
    if ("k" in c && !("c" in c)) {
      var v = 255 - c.k * (c.k <= 1 ? 255 : 1);
      return LD.toHex(v, v, v);
    }
    return null; // LAB, HSB 는 아직 변환하지 않음
  }

  var COLOR_MODES = { 0: "Bitmap", 1: "Grayscale", 2: "Indexed", 3: "RGB", 4: "CMYK", 7: "Multichannel", 8: "Duotone", 9: "Lab" };

  // 가장 긴 스타일 구간을 대표 스타일로 고릅니다.
  function dominantStyle(text) {
    var base = text.style || {};
    var runs = text.styleRuns || [];
    if (!runs.length) return { style: base, runs: [] };
    var best = runs[0];
    for (var i = 1; i < runs.length; i++) if (runs[i].length > best.length) best = runs[i];
    var merged = {};
    var k;
    for (k in base) merged[k] = base[k];
    for (k in best.style) merged[k] = best.style[k];
    return { style: merged, runs: runs };
  }

  function transformScaleY(t) {
    if (!t || t.length < 4) return 1;
    // [xx, xy, yx, yy, tx, ty] — 세로 방향 크기 변화를 글자 크기에 반영
    return Math.sqrt(t[2] * t[2] + t[3] * t[3]) || 1;
  }

  function getPpi(psd) {
    var ri = psd.imageResources && psd.imageResources.resolutionInfo;
    if (!ri) return { ppi: 72, assumed: true };
    var v = ri.horizontalResolution;
    if (ri.horizontalResolutionUnit === "PPCM") v = v * 2.54;
    return { ppi: v, assumed: false };
  }

  function extractFromPsd(psd, opts) {
    opts = opts || {};
    var warnings = [];
    var res = getPpi(psd);
    if (res.assumed) warnings.push("해상도 정보가 없어 72ppi로 가정했어요.");
    var ppi = res.ppi;
    var docKey = opts.fileName || "untitled.psd";
    var colorMode = COLOR_MODES[psd.colorMode == null ? 3 : psd.colorMode] || String(psd.colorMode);
    if (colorMode === "CMYK") {
      warnings.push("CMYK 문서예요. 글자색과 배경을 포토샵 기본 CMYK 프로필(U.S. Web Coated SWOP v2) 기준으로 RGB로 바꿔 계산했어요. 실제 인쇄 프로필이 다르면 대비가 조금 다를 수 있어요.");
    } else if (colorMode !== "RGB") {
      warnings.push(colorMode + " 문서예요. 색 계산이 정확하지 않을 수 있어요.");
    }

    var composite = psd.imageData
      ? { data: psd.imageData.data, width: psd.imageData.width, height: psd.imageData.height, components: 4, originX: 0, originY: 0 }
      : null;
    if (!composite) warnings.push("PSD에 합성 이미지가 없어 배경 픽셀을 읽지 못했어요. 포토샵에서 '호환성 최대화'를 켜고 저장해 주세요.");

    var groups = [];
    var layers = [];
    var autoId = 100000;

    function walk(list, path, idPath) {
      // ag-psd 는 아래 레이어부터 순서대로 줍니다. 결과는 위 레이어부터 보이도록 뒤집어요.
      for (var i = list.length - 1; i >= 0; i--) {
        var layer = list[i];
        var id = layer.id != null ? layer.id : autoId++;
        if (layer.children) {
          groups.push({ id: id, name: layer.name || "", groupPath: path.slice(), groupIds: idPath.slice(), visible: !layer.hidden });
          walk(layer.children, path.concat([layer.name || ""]), idPath.concat([id]));
          continue;
        }
        if (!layer.text) continue;

        var lw = [];
        var ds = dominantStyle(layer.text);
        var st = ds.style;
        var fontSize = st.fontSize;
        if (fontSize == null) lw.push("글자 크기 정보를 찾지 못했어요.");
        var scale = transformScaleY(layer.text.transform);
        var color = colorToHex(st.fillColor);
        if (!color) lw.push("글자 색을 RGB로 읽지 못했어요 (Lab 등).");

        var colorRuns = [];
        var seen = {};
        for (var r = 0; r < ds.runs.length; r++) {
          var hex = colorToHex(ds.runs[r].style.fillColor) || color;
          if (hex && !seen[hex]) {
            seen[hex] = true;
            colorRuns.push(hex);
          }
        }

        var hasPixels = layer.imageData && layer.right > layer.left && layer.bottom > layer.top;
        var bounds = hasPixels ? { left: layer.left, top: layer.top, right: layer.right, bottom: layer.bottom } : null;
        if (!bounds) lw.push("레이어 픽셀이 없어 위치와 배경을 계산하지 못했어요.");

        var background = null;
        if (bounds && composite) {
          var mask = { data: layer.imageData.data, width: layer.imageData.width, height: layer.imageData.height, components: 4, originX: layer.left, originY: layer.top };
          background = LD.summarizeBackground(composite, mask, bounds, {
            method: "psd-composite-minus-text-mask",
            compositeHasText: !layer.hidden
          });
          if (!layer.hidden && background.sampleCount === 0) lw.push("글자 사이에 보이는 배경 픽셀이 없어요.");
        }

        var effects = layer.effects && Object.keys(layer.effects).length ? Object.keys(layer.effects) : [];
        if (effects.length) lw.push("레이어 효과가 있어요 (" + effects.join(", ") + "). 외곽선·그림자는 대비 계산에 반영되지 않았어요.");

        layers.push(
          LD.buildTextLayer({
            id: id,
            docKey: docKey,
            name: layer.name,
            groupPath: path.slice(),
            groupIds: idPath.slice(),
            text: layer.text.text,
            fontName: st.font && st.font.name,
            fontPostScriptName: st.font && st.font.name,
            fontStyleName: null,
            fauxBold: st.fauxBold,
            sizePx: fontSize != null ? fontSize * scale : null,
            sizeSourcePx: fontSize,
            scale: scale,
            leadingSourcePx: st.autoLeading === false || (st.autoLeading == null && st.leading != null) ? st.leading : null,
            autoLeading: st.autoLeading,
            autoLeadingRatio: layer.text.paragraphStyle && layer.text.paragraphStyle.autoLeading,
            tracking: st.tracking,
            origin: layer.text.transform && layer.text.transform.length >= 6 ? { x: layer.text.transform[4], y: layer.text.transform[5] } : null,
            color: color,
            colorSource: colorSourceOf(st.fillColor),
            colorRuns: colorRuns,
            opacity: layer.opacity,
            fillOpacity: layer.fillOpacity,
            blendMode: layer.blendMode,
            visible: !layer.hidden,
            bounds: bounds,
            background: background,
            ppi: ppi,
            warnings: lw
          })
        );
      }
    }

    walk(psd.children || [], [], []);
    if (!layers.length) warnings.push("텍스트 레이어를 찾지 못했어요. 글자가 래스터화(이미지화)되어 있으면 OCR이 필요해요.");

    var doc = LD.buildDocument({
      source: "psd-file",
      docKey: docKey,
      name: opts.fileName || null,
      path: opts.filePath || null,
      widthPx: psd.width,
      heightPx: psd.height,
      ppi: ppi,
      colorMode: colorMode,
      groups: groups,
      layers: layers,
      warnings: warnings
    });

    // PSD 안에 저장된 목적 정보(XMP)가 있으면 레이어마다 채워요
    PS.applyToDocument(doc, PS.readFromPsd(psd));
    return doc;
  }

  return { extractFromPsd: extractFromPsd, colorToHex: colorToHex };
});
