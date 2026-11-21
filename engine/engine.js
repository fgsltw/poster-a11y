/*
 * engine.js — 검사 엔진 (기술 B 기준 구현)
 *
 * 입력: 공통 레이어 데이터 (docs/layer-data.md) + 보는 환경
 * 출력: 검사 결과 (docs/engine.md) — 목적에 따라 다르게 판정하고, 다르게 고치는 방법을 제안해요
 *
 *   const result = Engine.checkDocument(layerData, { medium: "wall", distanceM: 2, lighting: "normal" });
 *   const fixes  = Engine.toApplyFixes(result);   // → A 의 applyFixes 에 그대로 넣기
 *
 * 포토샵 없이 동작하는 순수 JS 예요 (Node·브라우저·UXP 공통).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./policies.js"), require("./color.js"), require("./roles.js"));
  } else {
    root.Engine = factory(root.EnginePolicies, root.EngineColor, root.EngineRoles);
  }
})(typeof self !== "undefined" ? self : this, function (DEFAULT_POLICIES, C, R) {
  "use strict";

  var STATUS_LABELS = { pass: "통과", warn: "주의", fail: "실패", advisory: "참고", conflict: "충돌" };
  var STATUS_ORDER = { conflict: 0, fail: 1, warn: 2, advisory: 3, pass: 4 };
  var ARCMIN = Math.PI / (180 * 60);

  function round(n, d) {
    var f = Math.pow(10, d == null ? 2 : d);
    return Math.round(n * f) / f;
  }
  function short(t) {
    t = String(t || "");
    return t.length > 12 ? t.slice(0, 11) + "…" : t;
  }
  function ceilHalf(n) {
    return Math.ceil(n * 2) / 2;
  }

  // ---------------------------------------------------------------- 목적 추천
  // 일시·장소·가격·접근성 정보 → 정보 전달
  // 제목, 제목과 같은 그룹의 글자, 제목 크기의 40% 이상인 큰 글자 → 예술적 표현
  function suggestPurposes(layers, roles) {
    var title = null;
    layers.forEach(function (l) { if (roles[l.id].role === "title") title = l; });
    var titleSize = title ? title.sizePt || 0 : 0;
    var titleGroup = title && title.groupIds && title.groupIds.length ? title.groupIds[title.groupIds.length - 1] : null;
    var out = {};
    layers.forEach(function (l) {
      var role = roles[l.id].role;
      var p;
      if (role === "date" || role === "place" || role === "price" || role === "access") p = "info";
      else if (role === "title") p = "art";
      else if (titleGroup != null && (l.groupIds || []).indexOf(titleGroup) >= 0) p = "art";
      else p = (l.sizePt || 0) >= titleSize * 0.4 ? "art" : "info";
      out[l.id] = p;
    });
    var kinds = {};
    layers.forEach(function (l) { kinds[out[l.id]] = true; });
    var doc = kinds.art && kinds.info ? "mixed" : kinds.art ? "art" : "info";
    return { layers: out, document: doc };
  }

  // ---------------------------------------------------------------- 환경
  function resolveEnv(env, policies, doc) {
    env = env || {};
    var medium = env.medium || "wall";
    var base = policies.environments[medium] || policies.environments.wall;
    return {
      medium: medium,
      mediumLabel: base.label,
      distanceM: env.distanceM || base.distanceM,
      lighting: env.lighting || "normal",
      // 누가 보나요: 일반 / 저시력(0.3) / 시각장애(0.2) / 심한 시각장애(0.06)
      viewer: policies.viewers && policies.viewers[env.viewer] ? env.viewer : "general",
      viewerLabel: policies.viewers ? (policies.viewers[env.viewer] || policies.viewers.general).label : "일반 시력",
      acuity: policies.viewers && policies.viewers[env.viewer] ? policies.viewers[env.viewer].acuity : null,
      // 시야: 보통 / 좁음(10°) / 아주 좁음(5°)
      field: policies.visualField && policies.visualField.levels[env.field] ? env.field : "normal",
      fieldLabel: policies.visualField ? (policies.visualField.levels[env.field] || policies.visualField.levels.normal).label : "보통 시야",
      fieldDeg: policies.visualField && policies.visualField.levels[env.field] ? policies.visualField.levels[env.field].deg : null,
      // 색각이상(적·녹·청색맹)인 사람도 보나요 (기본: 예)
      colorVision: env.colorVision !== false,
      // SNS: 휴대폰 화면 너비에 맞춰 보이는 크기
      displayScaleMmPerPx: base.screenWidthMm ? base.screenWidthMm / doc.document.widthPx : null
    };
  }

  // ---------------------------------------------------------------- 글자 크기
  // 이 각도(′)가 되려면 몇 pt 가 필요한지 (인쇄 pt 기준. SNS는 문서 pt 로 바꿔서)
  function ptForArcmin(arcmin, env, P, doc) {
    var S = P.size;
    var needGlyphMm = Math.tan(arcmin * ARCMIN) * env.distanceM * 1000;
    var needEmPx = env.displayScaleMmPerPx
      ? needGlyphMm / S.glyphHeightRatio / env.displayScaleMmPerPx
      : ((needGlyphMm / S.glyphHeightRatio) / 25.4) * doc.document.ppi;
    return ceilHalf((needEmPx * 72) / doc.document.ppi);
  }

  function checkSize(l, env, pol, P, doc, role) {
    var S = P.size;
    var glyphPx = (l.sizePx || 0) * S.glyphHeightRatio;
    var glyphMm = env.displayScaleMmPerPx ? glyphPx * env.displayScaleMmPerPx : (glyphPx / doc.document.ppi) * 25.4;
    var angle = Math.atan(glyphMm / (env.distanceM * 1000)) / ARCMIN;

    // 주최·후원 같은 부가 정보는 덜 엄격하게, 저시력 기준은 정책에 따라 판정에 넣거나 참고로만
    var secondary = (S.secondaryRoles || []).indexOf(role) >= 0;
    var lowVisionArcmin = S.readableArcminAt1_0 / S.lowVisionAcuity;
    var passArcmin = secondary ? S.secondaryPassArcmin : S.lowVisionRequired ? Math.max(S.passArcmin, lowVisionArcmin) : S.passArcmin;
    var warnArcmin = S.warnArcmin;

    // 보는 사람이 저시력이면: 겨우 보이는 크기(5′ ÷ 시력) × 여유(2배)를 통과 기준으로
    var V = env.acuity, LVR = P.lowVisionReading;
    if (V && LVR) {
      var threshold = S.readableArcminAt1_0 / V;
      passArcmin = secondary ? Math.max(S.secondaryPassArcmin, threshold) : Math.max(S.passArcmin, threshold * LVR.acuityReserve);
      warnArcmin = Math.max(S.warnArcmin, threshold);
      lowVisionArcmin = threshold;
    }

    var status = angle >= passArcmin ? "pass" : secondary ? "advisory" : angle >= warnArcmin ? "warn" : "fail";
    if (status !== "pass" && pol.judge === "advisory") status = "advisory";

    var recommendedPt = ptForArcmin(passArcmin, env, P, doc);
    var lowVisionOk = angle >= lowVisionArcmin;
    var lowVisionPt = ptForArcmin(lowVisionArcmin, env, P, doc);
    // 필요한 글자가 포스터에 비해 너무 크면 → 키우는 대신 큰 글씨 안내문
    var needGlyphPx = ((recommendedPt * doc.document.ppi) / 72) * S.glyphHeightRatio;
    var tooBig = !!(LVR && needGlyphPx > doc.document.heightPx * LVR.maxGlyphOfPosterHeight);

    var res = {
      check: "size",
      status: status,
      metric: "글자 높이 " + round(glyphMm, 1) + "mm · " + env.distanceM + "m에서 " + round(angle, 1) + "′ (기준 " + round(passArcmin, 1) + "′" +
        (secondary ? ", 부가 정보" : "") + (V ? ", " + env.viewerLabel : "") + ")" +
        // 저시력 참고는 일반 시력으로 검사할 때, 통과한 글자에만 붙여요
        (!V && status === "pass" && !lowVisionOk && !S.lowVisionRequired ? " · 참고: 저시력(" + S.lowVisionAcuity + ")까지 고려하면 " + lowVisionPt + "pt 이상" : ""),
      detail: {
        glyphMm: round(glyphMm, 2), arcmin: round(angle, 2), passArcmin: round(passArcmin, 2), recommendedPt: recommendedPt,
        secondary: secondary, viewer: env.viewer, acuity: V || null,
        lowVisionReadable: lowVisionOk, lowVisionPt: lowVisionPt, tooBig: tooBig
      },
      fix: null
    };
    if (status !== "pass") {
      res.message = secondary && pol.judge !== "advisory"
        ? "주최·후원 같은 부가 정보라서 핵심 정보보다 덜 엄격하게 봐요. 그래도 읽히게 하려면 " + recommendedPt + "pt 이상을 권장해요."
        : pol.messages.size;
      if (tooBig && !secondary) {
        // 포스터 글자만 키워서는 어려워요 → 큰 글씨 안내문·대체텍스트
        res.message = (V ? env.viewerLabel + " 기준으로 " : "") + "읽으려면 글자가 " + recommendedPt + "pt(포스터 높이의 " +
          Math.round((needGlyphPx / doc.document.heightPx) * 100) + "%)는 돼야 해요. 포스터 글자만 키워서는 어려워요. 큰 글씨 안내문이나 대체텍스트를 함께 제공해 주세요.";
        res.alternative = { type: "largePrint", notice: "큰 글씨 안내문(A4, 고대비)을 만들어 포스터 옆에 붙이거나 QR로 연결해 주세요." };
      } else if (pol.fix.allowSize) {
        // '참고'인 부가 정보 수정은 '모두 추가'에 들어가지 않아요 (하나씩 추가는 가능)
        res.fix = { type: "size", valuePt: recommendedPt, strategy: pol.fix.strategy, passes: true };
      }
    }
    return res;
  }

  // ---------------------------------------------------------------- 대비
  function backgroundRgbs(l) {
    var bg = l.background;
    if (!bg || !bg.samples || !bg.samples.length) return null;
    return bg.samples.map(C.hexToRgb);
  }

  // 배경 샘플 하나하나와의 대비 (반투명 글자는 배경과 섞어서)
  function contrastsFor(textRgb, bgs, alpha) {
    return bgs.map(function (bg) { return C.contrast(alpha < 1 ? C.blend(textRgb, bg, alpha) : textRgb, bg); }).sort(function (a, b) { return a - b; });
  }

  function percentile(sorted, p) {
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  }

  function complexityOf(l, P) {
    var sd = l.background && l.background.stats ? l.background.stats.luminanceStdDev : 0;
    return sd < P.contrast.complexity.simple ? "simple" : sd < P.contrast.complexity.busy ? "moderate" : "busy";
  }
  var COMPLEXITY_LABELS = { simple: "단순한 배경", moderate: "약간 복잡한 배경", busy: "복잡한 그림 배경" };

  // 배경 띠: 흰색·짙은색 중 나은 쪽, 정책이 허락하는 불투명도에서 (모든 글자색이) 기준을 넘는지
  function tryBackplate(textRgbs, bgs, alpha, target, maxOpacity, P) {
    var best = null;
    ["#FFFFFF", "#1B1A22"].forEach(function (hex) {
      var plate = C.hexToRgb(hex);
      var under = bgs.map(function (bg) { return C.blend(plate, bg, maxOpacity); });
      var worst = Math.min.apply(null, textRgbs.map(function (t) { return percentile(contrastsFor(t, under, alpha), P.contrast.worstPercentile); }));
      if (!best || worst > best.contrast) best = { color: hex, opacity: maxOpacity, contrast: worst };
    });
    best.passes = best.contrast >= target;
    return best;
  }

  // 글자 안에 색이 여러 가지면(강조색 등) 색마다 따로 계산해요
  function colorRunsOf(l) {
    var list = (l.colorRuns && l.colorRuns.length ? l.colorRuns : [l.color]).filter(Boolean).map(function (h) { return h.toUpperCase(); });
    var seen = {}, out = [];
    list.forEach(function (h) { if (!seen[h] && C.hexToRgb(h)) { seen[h] = true; out.push(h); } });
    return out;
  }

  function checkContrast(l, env, pol, P, policyKey, docPurpose, altText) {
    var bgs = backgroundRgbs(l);
    var hexes = colorRunsOf(l);
    if (!hexes.length || !bgs) {
      return { check: "contrast", status: "warn", metric: "글자색이나 배경을 읽지 못해 대비를 계산하지 못했어요", detail: {}, fix: null };
    }
    var alpha = l.opacity == null ? 1 : l.opacity;
    var runs = hexes.map(function (hex) {
      var cs = contrastsFor(C.hexToRgb(hex), bgs, alpha);
      return { color: hex, worst: percentile(cs, P.contrast.worstPercentile), min: cs[0] };
    });
    var worstRun = runs.reduce(function (a, b) { return b.worst < a.worst ? b : a; });
    var worst = worstRun.worst;
    var bold = l.font && l.font.weightGuess === "bold";
    var large = l.sizePt >= P.contrast.largePt || (bold && l.sizePt >= P.contrast.largeBoldPt);
    var dim = env.lighting === "dim" && policyKey === "info";
    var target = large ? (dim ? P.contrast.dimLarge : P.contrast.large) : dim ? P.contrast.dimNormal : P.contrast.normal;
    // 보는 사람이 저시력이면 정보 글자는 WCAG 1.4.6(AAA) 기준
    var lowVisionContrast = !!(env.acuity && policyKey === "info" && P.lowVisionReading);
    if (lowVisionContrast) target = Math.max(target, large ? P.lowVisionReading.contrastLarge : P.lowVisionReading.contrastNormal);
    var complexity = complexityOf(l, P);
    var multi = runs.length > 1;

    var status = worst >= target ? "pass" : "fail";
    if (status === "fail" && pol.judge === "advisory") status = "advisory";

    var res = {
      check: "contrast",
      status: status,
      metric: "대비 " + round(worst, 1) + ":1 · 기준 " + target + ":1" + (large ? " (큰 글자)" : "") + (lowVisionContrast ? " (저시력 기준)" : "") + " · " + COMPLEXITY_LABELS[complexity] +
        (multi ? " · 글자색 " + runs.length + "가지 중 가장 낮은 색 " + worstRun.color : ""),
      detail: {
        worst: round(worst, 2), min: round(worstRun.min, 2), target: target, large: large, complexity: complexity, dimLighting: dim,
        runs: runs.map(function (r) { return { color: r.color, worst: round(r.worst, 2), passes: r.worst >= target }; })
      },
      fix: null,
      alternative: null
    };
    if (l.blendMode && l.blendMode !== "normal") res.detail.note = "혼합 모드(" + l.blendMode + ") 때문에 실제 보이는 색이 다를 수 있어요";
    if (status === "pass") return res;
    res.message = pol.messages.contrast;

    // 1) 같은 색상에서 밝기만 바꾸기 — 기준에 못 미치는 색만 바꾸고, 통과한 색(강조색 등)은 그대로 둬요
    var bgLums = bgs.map(C.luminance).sort(function (a, b) { return a - b; });
    // 아주 드문 얼룩 픽셀(아래·위 2%)은 빼고 찾아요
    var cut = Math.floor(bgLums.length * P.contrast.worstPercentile);
    var lums = bgLums.slice(cut, bgLums.length - cut || bgLums.length);
    var changes = [], allPass = true, after = Infinity;
    runs.forEach(function (r) {
      if (r.worst >= target) { after = Math.min(after, r.worst); return; }
      var c = C.findAccessibleColor(r.color, lums, target, { maxShift: pol.fix.maxLightnessShift, alpha: alpha, bgRgbs: alpha < 1 ? bgs : null });
      if (!c) { allPass = false; return; }
      if (!c.passes) allPass = false;
      after = Math.min(after, c.contrast);
      changes.push({ from: r.color, value: c.hex });
    });
    function colorFix(strategy, passes) {
      if (!changes.length) return null;
      var f = { type: "color", value: changes[0].value, strategy: strategy, passes: passes, contrastAfter: round(after, 2) };
      if (multi) f.runs = changes; // 이 색들만 바꿔요
      return f;
    }
    if (changes.length && allPass) {
      res.fix = colorFix(pol.fix.strategy, true);
      return res;
    }

    // 2) 글자 뒤 배경 띠 (복합 목적에서 그림 위 정보 글자는 그림을 가리지 않도록 막아요)
    var overArt = complexity === "busy";
    var plateAllowed = pol.fix.allowBackplate && !(docPurpose === "mixed" && overArt && !P.purposes.mixed.allowBackplateOverArt);
    if (plateAllowed) {
      var plate = tryBackplate(hexes.map(C.hexToRgb), bgs, alpha, target, pol.fix.backplateMaxOpacity, P);
      if (plate.passes) {
        res.fix = { type: "backplate", color: plate.color, opacity: plate.opacity, paddingMm: 1.5, strategy: pol.fix.strategy, passes: true, contrastAfter: round(plate.contrast, 2) };
        return res;
      }
    }

    // 3) 고쳐도 기준을 못 넘음 → 가장 나은 수정 + 대체 정보
    res.fix = colorFix("minimal", false);
    if (policyKey === "info" && docPurpose === "mixed") {
      res.status = "conflict";
      res.message = "정보 글자가 예술 이미지 위에 있어서, 그림을 가리지 않고는 기준을 넘기 어려워요. 같은 정보를 다른 곳(대체텍스트, 별도 안내문)에서도 제공해 주세요.";
    }
    if (res.status === "conflict" || pol.support === "alternative") {
      res.alternative = { type: "altText", draft: altText, notice: "포스터 아래나 SNS 본문에 같은 정보를 글로 함께 적어 주세요." };
    }
    return res;
  }

  // ---------------------------------------------------------------- 색 의존 정보 (WCAG 1.4.1 색 사용)
  //   한 글자 안에서 크기·굵기·기울임·밑줄은 같고 색만 다른 구간 = 색으로만 구분한 정보
  //   그 두 색이 색각이상(적·녹·청색맹)으로 보면 거의 같아지면 '주의'
  function checkColorOnly(l, contrastRes, pol, P) {
    var CV = P.colorVision;
    var runs = (l.styleRuns || []).filter(function (r) { return r.color && C.hexToRgb(r.color); });
    if (!CV || runs.length < 2) return null;
    var pairs = [];
    for (var i = 0; i < runs.length; i++) {
      for (var j = i + 1; j < runs.length; j++) {
        var a = runs[i], b = runs[j];
        if (a.color.toUpperCase() === b.color.toUpperCase()) continue;
        var big = Math.max(a.sizePx || 0, b.sizePx || 0) || 1;
        var sameShape = Math.abs((a.sizePx || 0) - (b.sizePx || 0)) <= big * CV.sameSizeRatio &&
          !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline;
        if (!sameShape) continue; // 모양으로도 구분돼요
        var ra = C.hexToRgb(a.color), rb = C.hexToRgb(b.color);
        var normal = C.deltaE(ra, rb);
        if (normal < CV.minDeltaE) continue; // 원래도 거의 같은 색이면 강조가 아니에요
        var lost = CV.types.filter(function (t) { return C.deltaE(C.simulateCvd(ra, t), C.simulateCvd(rb, t)) < CV.minDeltaE; });
        pairs.push({ a: a.text.trim(), b: b.text.trim(), colors: [a.color, b.color], deltaE: round(normal, 3), lostFor: lost });
      }
    }
    if (!pairs.length) return null;
    var lostAll = [];
    pairs.forEach(function (p) { p.lostFor.forEach(function (t) { if (lostAll.indexOf(t) < 0) lostAll.push(t); }); });
    var p0 = pairs.filter(function (p) { return p.lostFor.length; })[0] || pairs[0];
    var names = lostAll.map(function (t) { return CV.labels[t]; }).join("·");
    var fix = lostAll.length ? colorOnlyFix(l, p0, contrastRes, pol, P) : null;
    return {
      check: "colorOnly",
      status: pol.judge === "advisory" || !lostAll.length ? "advisory" : "warn",
      metric: "“" + short(p0.a) + "”, “" + short(p0.b) + "” 두 부분이 모양은 같고 색만 달라요 (" + p0.colors.join(" · ") + ")" +
        (lostAll.length ? " · " + names + "이면 두 색이 거의 같아 보여요" : ""),
      message: "색을 구분하기 어려운 사람도 알 수 있게 굵게·밑줄·기호(●, ★)·괄호 같은 모양으로도 구분해 주세요 (WCAG 1.4.1)." +
        (fix ? " 자동 수정은 강조한 부분을 굵게 하고 밑줄을 그어요" + (fix.runs[0].value ? " (밝기도 함께 바꿔요)" : "") + "." : ""),
      detail: { pairs: pairs, lostFor: lostAll },
      fix: fix
    };
  }
  // 색만 다른 두 구간 중 짧은 쪽(보통 강조)의 밝기만 바꿔요 (색상은 그대로)
  //   목표: 색각이상 눈(구분이 안 되던 유형 모두)으로 봐도 두 색 거리 ≥ fixDeltaE, 배경 대비는 기준 유지. 가장 작은 변화
  function colorOnlyFix(l, pair, contrastRes, pol, P) {
    var CV = P.colorVision, bgs = backgroundRgbs(l);
    if (!bgs || !contrastRes || !contrastRes.detail || !contrastRes.detail.target) return null;
    var target = contrastRes.detail.target, alpha = l.opacity == null ? 1 : l.opacity, types = pair.lostFor.length ? pair.lostFor : CV.types;
    var order = pair.a.length <= pair.b.length ? [[pair.colors[0], pair.colors[1]], [pair.colors[1], pair.colors[0]]] : [[pair.colors[1], pair.colors[0]], [pair.colors[0], pair.colors[1]]];
    var best = null;
    order.forEach(function (o) {
      if (best && best.passes) return;
      var base = C.rgbToOklch(C.hexToRgb(o[0])), other = C.hexToRgb(o[1]);
      [-1, 1].forEach(function (dir) {
        for (var step = 1; step <= 100; step++) {
          var shift = (step / 100) * dir;
          if (Math.abs(shift) > pol.fix.maxLightnessShift + 1e-9 || base.L + shift < 0 || base.L + shift > 1) break;
          var rgb = C.oklchToRgb({ L: base.L + shift, C: base.C, h: base.h });
          var dE = Math.min.apply(null, types.map(function (t) { return C.deltaE(C.simulateCvd(rgb, t), C.simulateCvd(other, t)); }));
          var bgWorst = percentile(contrastsFor(rgb, bgs, alpha), P.contrast.worstPercentile);
          var cand = { from: o[0], value: C.rgbToHex(rgb), deltaE: dE, bgContrast: bgWorst, shift: Math.abs(shift), passes: dE >= CV.fixDeltaE && bgWorst >= target };
          if (cand.passes) { if (!best || !best.passes || cand.shift < best.shift) best = cand; break; }
          if (!best || (!best.passes && bgWorst >= target && cand.deltaE > best.deltaE)) best = cand;
        }
      });
    });
    // 강조 쪽(짧은 구간)에 굵게 + 밑줄 → 색을 전혀 못 느껴도 모양으로 구분돼요 (WCAG 1.4.1이 권하는 방법)
    //   밝기 차이까지 낼 수 있으면(passes) 그 색도 같이 넣어요
    var emph = pair.a.length <= pair.b.length ? pair.colors[0] : pair.colors[1];
    var run = { from: emph, bold: true, underline: true };
    if (best && best.passes && best.from.toUpperCase() === emph.toUpperCase()) run.value = best.value;
    return { type: "emphasis", runs: [run], strategy: "shape", passes: true,
      contrastAfter: run.value ? round(best.bgContrast, 2) : undefined, deltaEAfter: run.value ? round(best.deltaE, 3) : undefined };
  }

  // 일반 눈으로는 대비가 충분해도, 색각이상으로 보면 대비가 기준 밑으로 떨어지는지
  function checkCvdContrast(l, contrastRes, pol, P) {
    var CV = P.colorVision;
    if (!CV || !contrastRes || contrastRes.status !== "pass") return null; // 원래 대비 문제는 대비 검사가 알려요
    var bgs = backgroundRgbs(l);
    var hexes = colorRunsOf(l);
    if (!bgs || !hexes.length) return null;
    var target = contrastRes.detail.target, alpha = l.opacity == null ? 1 : l.opacity;
    var drops = [];
    CV.types.forEach(function (t) {
      var simBgs = bgs.map(function (bg) { return C.simulateCvd(bg, t); });
      var worst = Infinity;
      hexes.forEach(function (h) {
        var cs = contrastsFor(C.simulateCvd(C.hexToRgb(h), t), simBgs, alpha);
        worst = Math.min(worst, percentile(cs, P.contrast.worstPercentile));
      });
      if (worst < target) drops.push({ type: t, worst: round(worst, 2) });
    });
    if (!drops.length) return null;
    drops.sort(function (a, b) { return a.worst - b.worst; });
    var d0 = drops[0];
    var fix = cvdContrastFix(l, hexes, bgs, alpha, target, pol, P);
    return {
      check: "cvd",
      status: pol.judge === "advisory" ? "advisory" : "warn",
      metric: CV.labels[d0.type] + "으로 보면 대비 " + d0.worst + ":1 (기준 " + target + ":1) · 일반 눈 " + round(contrastRes.detail.worst, 1) + ":1" +
        (drops.length > 1 ? " · " + drops.slice(1).map(function (d) { return CV.labels[d.type] + " " + d.worst + ":1"; }).join(", ") : ""),
      message: "빨강·초록처럼 색은 다르지만 밝기가 비슷한 조합은 색각이상이 있으면 잘 안 보여요. 글자와 배경의 밝기 차이를 더 크게 해 주세요.",
      detail: { drops: drops, target: target, normalWorst: contrastRes.detail.worst },
      fix: fix
    };
  }
  function cvdContrastFix(l, hexes, bgs, alpha, target, pol, P) {
    var CV = P.colorVision;
    var lums = bgs.map(C.luminance).sort(function (a, b) { return a - b; });
    var cut = Math.floor(lums.length * P.contrast.worstPercentile);
    lums = lums.slice(cut, lums.length - cut || lums.length);
    var simBgs = {};
    CV.types.forEach(function (t) { simBgs[t] = bgs.map(function (bg) { return C.simulateCvd(bg, t); }); });
    var cvdWorst = function (hex) {
      return Math.min.apply(null, CV.types.map(function (t) { return percentile(contrastsFor(C.simulateCvd(C.hexToRgb(hex), t), simBgs[t], alpha), P.contrast.worstPercentile); }));
    };
    var best = null;
    for (var goal = target; goal <= CV.fixMaxContrast + 1e-9; goal += CV.fixStep) {
      var changes = [], worst = Infinity;
      hexes.forEach(function (h) {
        if (cvdWorst(h) >= target) { worst = Math.min(worst, cvdWorst(h)); return; }
        var c = C.findAccessibleColor(h, lums, goal, { maxShift: pol.fix.maxLightnessShift, alpha: alpha, bgRgbs: alpha < 1 ? bgs : null });
        var hex = c ? c.hex : h;
        worst = Math.min(worst, cvdWorst(hex));
        if (hex.toUpperCase() !== h.toUpperCase()) changes.push({ from: h, value: hex });
      });
      if (!changes.length) continue;
      var cand = { changes: changes, worst: worst, passes: worst >= target };
      if (!best || cand.worst > best.worst) best = cand;
      if (cand.passes) break;
    }
    if (!best) return null;
    var f = { type: "color", value: best.changes[0].value, strategy: "cvd", passes: best.passes, contrastAfter: round(best.worst, 2) };
    if (hexes.length > 1) f.runs = best.changes;
    return f;
  }

  // ---------------------------------------------------------------- ① 글꼴 가독성 (장식·좁은 글꼴, 기울임, 전부 대문자)
  function checkFont(l, pol, P) {
    var F = P.fontLegibility;
    if (!F) return null;
    var raw = (l.font && (l.font.postScriptName || l.font.name)) || "";
    var name = raw.toLowerCase();
    // "NanumBrushScript-Bold" → ["nanum", "brush", "script", "bold"]
    var words = raw.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9가-힣]+/).filter(Boolean);
    function has(list) {
      return !!name && list.some(function (k) {
        k = k.toLowerCase();
        return /[가-힣]/.test(k) ? name.indexOf(k) >= 0 : words.some(function (w) { return w.indexOf(k) === 0; });
      });
    }
    var issues = [];
    if (has(F.decorative)) issues.push({ key: "decorative", text: "장식·손글씨 글꼴" });
    if (has(F.condensed)) issues.push({ key: "condensed", text: "폭이 좁은 글꼴" });
    if (has(F.italic) || (l.font && l.font.fauxItalic)) issues.push({ key: "italic", text: "기울임 글꼴" });
    var letters = String(l.text || "").replace(/[^A-Za-z]/g, "");
    if ((l.font && l.font.caps === "all") || (letters.length >= F.allCapsMinLetters && letters === letters.toUpperCase())) {
      issues.push({ key: "allCaps", text: "영문 전부 대문자" });
    }
    if (!issues.length) return null; // 문제가 있을 때만 결과를 만들어요
    return {
      check: "font",
      status: pol.judge === "advisory" ? "advisory" : "warn",
      metric: issues.map(function (i) { return i.text; }).join(" · ") + (l.font && l.font.name ? " (" + l.font.name + ")" : ""),
      message: pol.messages.font,
      detail: { issues: issues.map(function (i) { return i.key; }), fontName: l.font && l.font.name },
      fix: null
    };
  }

  // ---------------------------------------------------------------- ① 글자 굵기
  function checkWeight(l, pol, P) {
    var w = l.font && l.font.weightGuess;
    if (P.weight.thinWeights.indexOf(w) < 0) return null; // 얇은 글꼴일 때만 결과를 만들어요
    var big = (l.sizePt || 0) >= P.weight.okAbovePt;
    var status = big ? "pass" : pol.judge === "advisory" ? "advisory" : "warn";
    var res = {
      check: "weight",
      status: status,
      metric: "얇은 글꼴 (" + (l.font.name || "이름 없음") + ") · " + l.sizePt + "pt" + (big ? " — 충분히 커서 괜찮아요" : ""),
      detail: { weightGuess: w, fontName: l.font.name, okAbovePt: P.weight.okAbovePt },
      fix: null
    };
    if (status !== "pass") {
      res.message = pol.messages.weight;
      if (pol.fix.allowWeight) res.fix = { type: "weight", fauxBold: true, strategy: pol.fix.strategy, passes: true };
    }
    return res;
  }

  // ---------------------------------------------------------------- ④ 텍스트 간격
  function checkSpacing(l, pol, P) {
    var s = l.spacing;
    if (!s) return null;
    var S = P.spacing, issues = [], fix = null;
    var multi = s.lineCount >= 2;
    if (multi && s.lineHeightRatio != null && s.lineHeightRatio < S.lineHeightMin) {
      issues.push("줄 간격 " + round(s.lineHeightRatio, 2) + "배 (기준 " + S.lineHeightMin + "배 이상)");
      fix = fix || {};
      fix.lineHeight = S.lineHeightMin;
    }
    if (s.letterSpacingEm < S.letterSpacingMin) {
      issues.push("자간 " + s.letterSpacingEm + "em (기준 " + S.letterSpacingMin + "em 이상)");
      fix = fix || {};
      fix.letterSpacingEm = S.letterSpacingMin;
    }
    // 한 줄이고 자간도 괜찮으면 결과를 만들지 않아요
    if (!issues.length && !multi) return null;
    var status = issues.length ? (pol.judge === "advisory" ? "advisory" : "warn") : "pass";
    var res = {
      check: "spacing",
      status: status,
      metric: issues.length ? issues.join(" · ") : "줄 간격 " + round(s.lineHeightRatio, 2) + "배 · " + s.lineCount + "줄",
      detail: { lineCount: s.lineCount, lineHeightRatio: s.lineHeightRatio, letterSpacingEm: s.letterSpacingEm, wcag: { lineHeight: S.lineHeightMin, letterSpacing: S.letterSpacingWcag, wordSpacing: S.wordSpacingWcag } },
      fix: null
    };
    if (issues.length) {
      res.message = pol.messages.spacing;
      if (pol.fix.allowSpacing) res.fix = Object.assign({ type: "spacing", strategy: pol.fix.strategy, passes: true }, fix);
    }
    return res;
  }

  // ---------------------------------------------------------------- ③ 확대 후 잘림·겹침
  function boxOf(l) {
    var b = l.bounds;
    return b ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom } : null;
  }
  // 글자 기준점(베이스라인 왼쪽)을 중심으로 factor 배 키운 상자 — A 의 applyFixes 와 같은 방식
  function scaledBox(l, factor) {
    var b = boxOf(l);
    if (!b) return null;
    var o = l.origin || { x: b.left, y: b.bottom };
    return {
      left: o.x + (b.left - o.x) * factor,
      top: o.y + (b.top - o.y) * factor,
      right: o.x + (b.right - o.x) * factor,
      bottom: o.y + (b.bottom - o.y) * factor
    };
  }
  function overlaps(a, b, tol) {
    return Math.min(a.right, b.right) - Math.max(a.left, b.left) > tol && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tol;
  }
  function overflowOf(box, W, H, m) {
    var o = { left: m - box.left, top: m - box.top, right: box.right - (W - m), bottom: box.bottom - (H - m) };
    var out = {};
    Object.keys(o).forEach(function (k) { if (o[k] > 0.5) out[k] = Math.round(o[k]); });
    return Object.keys(out).length ? out : null;
  }
  var SIDE_LABELS = { left: "왼쪽", top: "위", right: "오른쪽", bottom: "아래" };

  function sizeFixFactor(l, sizeRes) {
    var f = sizeRes && sizeRes.fix;
    if (!f || f.type !== "size" || !l.sizePt) return 1;
    return f.valuePt / l.sizePt;
  }

  function checkLayout(doc, layers, perLayer, P) {
    var W = doc.document.widthPx, H = doc.document.heightPx;
    var L = P.layout, out = [];
    // 모든 수정을 함께 적용했을 때의 상자
    var after = {};
    layers.forEach(function (l) {
      after[l.id] = scaledBox(l, sizeFixFactor(l, perLayer[l.id] && perLayer[l.id].size));
    });
    function problemsAt(l, factor) {
      var box = scaledBox(l, factor);
      if (!box) return null;
      var hits = layers.filter(function (o) { return o.id !== l.id && after[o.id] && overlaps(box, after[o.id], L.overlapTolerancePx); });
      var over = overflowOf(box, W, H, L.canvasMarginPx);
      return hits.length || over ? { hits: hits, overflow: over } : null;
    }
    function describeProblem(p) {
      var parts = [];
      if (p.overflow) parts.push("포스터 밖으로 나가요 (" + Object.keys(p.overflow).map(function (k) { return SIDE_LABELS[k] + " " + p.overflow[k] + "px"; }).join(", ") + ")");
      if (p.hits.length) parts.push(p.hits.map(function (o) { return "'" + short(o.text) + "'"; }).join(", ") + "와(과) 겹쳐요");
      return parts.join(" · ");
    }

    var reported = {};
    layers.forEach(function (l) {
      var sizeRes = perLayer[l.id] && perLayer[l.id].size;
      var factor = sizeFixFactor(l, sizeRes);
      var common = { layerId: l.id, layerName: l.name, text: l.text, check: "layout", purpose: sizeRes && sizeRes.purpose, purposeSource: sizeRes && sizeRes.purposeSource };
      if (factor > 1) {
        var p = problemsAt(l, factor);
        if (!p) {
          out.push(Object.assign({}, common, { status: "pass", metric: "추천 크기 " + sizeRes.fix.valuePt + "pt로 키워도 잘리거나 겹치지 않아요", detail: { factor: round(factor, 2) } }));
          return;
        }
        // 겹치지 않는 가장 큰 크기 찾기
        var lo = 1, hi = factor;
        if (problemsAt(l, 1)) lo = 1;
        else for (var i = 0; i < 20; i++) { var mid = (lo + hi) / 2; if (problemsAt(l, mid)) hi = mid; else lo = mid; }
        var maxFitPt = problemsAt(l, lo) ? null : Math.floor(l.sizePt * lo * 2) / 2;
        var res = Object.assign({}, common, {
          status: "warn",
          metric: "추천 크기 " + sizeRes.fix.valuePt + "pt로 키우면 " + describeProblem(p),
          message: "여러 줄로 나누거나, 위치를 옮기거나, 주변 여백을 늘려 주세요." + (maxFitPt && maxFitPt > l.sizePt ? " 지금 자리에서 겹치지 않는 최대 크기는 " + maxFitPt + "pt예요." : ""),
          detail: { factor: round(factor, 2), overflow: p.overflow, overlapsWith: p.hits.map(function (o) { return o.id; }), maxFitPt: maxFitPt },
          fix: null
        });
        sizeRes.fix.layoutWarning = res.metric;
        if (maxFitPt) sizeRes.fix.maxFitPt = maxFitPt;
        out.push(res);
        p.hits.forEach(function (o) { reported[[l.id, o.id].sort().join(":")] = true; });
        return;
      }
      // 지금 이미 겹쳐 있거나 잘린 글자
      var now = problemsAt(l, 1);
      if (!now) return;
      var hits = now.hits.filter(function (o) { return !reported[[l.id, o.id].sort().join(":")]; });
      if (!hits.length && !now.overflow) return;
      hits.forEach(function (o) { reported[[l.id, o.id].sort().join(":")] = true; });
      out.push(Object.assign({}, common, {
        status: sizeRes && sizeRes.purpose === "art" ? "advisory" : "warn",
        metric: "지금 " + describeProblem({ hits: hits, overflow: now.overflow }),
        message: "글자끼리 겹치거나 잘리면 읽기 어려워요. 위치나 간격을 조정해 주세요.",
        detail: { overflow: now.overflow, overlapsWith: hits.map(function (o) { return o.id; }) },
        fix: null
      }));
    });
    return out;
  }

  // ---------------------------------------------------------------- 핵심 정보 위계 · ⑤ 계층과 그룹화
  function gapBetween(a, b) {
    var dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
    var dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
    return Math.sqrt(dx * dx + dy * dy);
  }

  function checkGrouping(doc, roles, docPurpose, P) {
    var Hc = P.hierarchy, out = [];
    var bad = docPurpose === "art" ? "advisory" : "warn";
    var H = doc.document.heightPx, W = doc.document.widthPx;
    var visible = doc.layers.filter(function (l) { return l.visible !== false && l.text && l.text.trim() && l.bounds; });
    if (!visible.length) return out;

    // 제목과 본문이 구별되는가
    var title = visible.filter(function (l) { return roles[l.id].role === "title"; })[0];
    var others = visible.filter(function (l) { return l !== title; }).map(function (l) { return l.sizePt || 0; }).sort(function (a, b) { return a - b; });
    if (title && others.length) {
      var med = others[Math.floor(others.length / 2)] || 1;
      var ratio = (title.sizePt || 0) / med;
      var ok = ratio >= Hc.titleRatioMin;
      out.push({
        layerId: title.id, layerName: title.name, text: title.text, role: "title", check: "hierarchy",
        status: ok ? "pass" : bad,
        metric: "제목이 본문보다 " + round(ratio, 1) + "배 커요 (기준 " + Hc.titleRatioMin + "배)",
        message: ok ? undefined : "제목과 본문의 크기 차이가 작아 무엇이 제목인지 알기 어려워요. 제목을 키우거나 본문을 줄여 주세요.",
        detail: { titleRatio: round(ratio, 2), median: med }
      });
    }

    // 관련 정보가 가까이 있는가
    Hc.relatedPairs.forEach(function (pair) {
      var A = visible.filter(function (l) { return roles[l.id].role === pair[0]; });
      var B = visible.filter(function (l) { return roles[l.id].role === pair[1]; });
      if (!A.length || !B.length) return;
      var best = null;
      A.forEach(function (a) { B.forEach(function (b) {
        var g = gapBetween(a.bounds, b.bounds);
        if (!best || g < best.gap) best = { a: a, b: b, gap: g };
      }); });
      var r = best.gap / H, near = r <= Hc.relatedMaxGapRatio;
      out.push({
        layerId: best.b.id, layerName: best.b.name, text: best.b.text, role: pair[1], check: "hierarchy",
        status: near ? "pass" : bad,
        metric: R.LABELS[pair[0]] + "–" + R.LABELS[pair[1]] + " 거리: 포스터 높이의 " + Math.round(r * 100) + "% (기준 " + Math.round(Hc.relatedMaxGapRatio * 100) + "% 이하)",
        message: near ? undefined : R.LABELS[pair[0]] + "와(과) " + R.LABELS[pair[1]] + "이(가) 멀리 떨어져 있어요. 함께 읽어야 하는 정보는 가까이 모아 주세요.",
        detail: { pair: pair, gapPx: Math.round(best.gap), gapRatio: round(r, 3), layerIds: [best.a.id, best.b.id] }
      });
    });

    // 글자 묶음이 너무 붙어 있는가 (위아래로 놓인 글자 사이)
    for (var i = 0; i < visible.length; i++) {
      for (var j = 0; j < visible.length; j++) {
        var a = visible[i].bounds, b = visible[j].bounds;
        if (i === j || a.bottom > b.top) continue; // a 가 b 위에 있을 때만
        if (Math.min(a.right, b.right) <= Math.max(a.left, b.left)) continue; // 가로로 겹치는 범위가 있어야 위아래 이웃
        var gap = b.top - a.bottom;
        var em = Math.min(visible[i].sizePx || 0, visible[j].sizePx || 0);
        if (em && gap < Hc.crowdedGapEm * em) {
          out.push({
            layerId: visible[j].id, layerName: visible[j].name, text: visible[j].text, check: "hierarchy",
            status: bad,
            metric: "'" + short(visible[i].text) + "'와(과) 사이가 " + Math.round(gap) + "px (글자 크기의 " + round(gap / em, 2) + "배, 기준 " + Hc.crowdedGapEm + "배 이상)",
            message: "글자 묶음이 너무 붙어 있어 한 덩어리로 보여요. 사이 여백을 늘려 주세요.",
            detail: { crowdedWith: visible[i].id, gapPx: Math.round(gap), gapEm: round(gap / em, 2) }
          });
        }
      }
    }

    // 글자가 너무 밀집되어 있는가 (글자 상자 면적 합 / 포스터 면적)
    var area = visible.reduce(function (s, l) { return s + l.bounds.width * l.bounds.height; }, 0);
    var cov = area / (W * H);
    out.push({
      layerId: null, check: "hierarchy",
      status: cov <= Hc.maxTextCoverage ? "pass" : bad,
      metric: "글자가 차지하는 면적: 포스터의 " + Math.round(cov * 100) + "% (기준 " + Math.round(Hc.maxTextCoverage * 100) + "% 이하)",
      message: cov <= Hc.maxTextCoverage ? undefined : "글자가 너무 많아 복잡해 보여요. 덜 중요한 정보는 줄이거나 다른 곳으로 옮겨 주세요.",
      detail: { textCoverage: round(cov, 3) }
    });
    return out;
  }

  // ---------------------------------------------------------------- 시야가 좁은 사람: 핵심 정보가 한눈에 들어오나
  //   관람 거리에서 한 번에 보이는 지름 = 2 × 거리 × tan(시야 반지름)
  //   핵심 정보(일시·장소·가격·접근성)를 그 지름 안에 몇 묶음으로 나눠 봐야 하는지 = 시선을 옮기는 횟수
  function checkField(doc, roles, env, docPurpose, P) {
    var VF = P.visualField;
    if (!VF || !env.fieldDeg) return [];
    var mmPerPx = env.displayScaleMmPerPx || 25.4 / doc.document.ppi;
    var viewMm = 2 * env.distanceM * 1000 * Math.tan((env.fieldDeg * Math.PI) / 180);
    var viewPx = viewMm / mmPerPx;
    var items = doc.layers.filter(function (l) {
      return l.visible !== false && l.bounds && VF.roles.indexOf(roles[l.id] && roles[l.id].role) >= 0;
    }).sort(function (a, b) { return a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left; });
    if (items.length < 2) return [];

    // 위에서부터 묶어요: 묶음 상자의 대각선이 한 번에 보이는 지름 안이면 같은 묶음
    var clusters = [];
    items.forEach(function (l) {
      var b = l.bounds, placed = false;
      for (var i = 0; i < clusters.length && !placed; i++) {
        var c = clusters[i];
        var u = { left: Math.min(c.box.left, b.left), top: Math.min(c.box.top, b.top), right: Math.max(c.box.right, b.right), bottom: Math.max(c.box.bottom, b.bottom) };
        if (Math.hypot(u.right - u.left, u.bottom - u.top) <= viewPx) { c.box = u; c.ids.push(l.id); placed = true; }
      }
      if (!placed) clusters.push({ box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, ids: [l.id] });
    });
    var n = clusters.length;
    // 이미 '핵심 정보 띠'처럼 모든 핵심 정보를 한 레이어에 담은 글자가 있으면 한눈에 보여요
    var norm = function (t) { return String(t || "").replace(/\s+/g, ""); };
    //   (그 띠도 일시 글자처럼 핵심 정보로 분류될 수 있어서, 자기 자신을 뺀 나머지를 다 담았는지 봐요)
    var gathered = n > 1 && doc.layers.some(function (l) {
      if (l.visible === false || !l.text) return false;
      var t = norm(l.text), others = items.filter(function (k) { return k !== l; });
      return others.length >= 2 && others.every(function (k) { return t.indexOf(norm(k.text)) >= 0; });
    });
    if (gathered) n = 1;
    var bad = docPurpose === "art" ? "advisory" : n >= 3 ? "fail" : "warn";
    var whole = items.reduce(function (u, l) {
      var b = l.bounds;
      return { left: Math.min(u.left, b.left), top: Math.min(u.top, b.top), right: Math.max(u.right, b.right), bottom: Math.max(u.bottom, b.bottom) };
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    return [{
      layerId: null,
      check: "field",
      status: n === 1 ? "pass" : bad,
      metric: env.fieldLabel + " · " + env.distanceM + "m에서 한 번에 보이는 지름 약 " + Math.round(viewMm / 10) + "cm · 핵심 정보가 " + n + "군데" + (n === 1 ? " (한눈에 보여요)" : "로 흩어져 있어요"),
      message: n === 1 ? (gathered ? "흩어진 핵심 정보를 한곳에 모은 글자(핵심 정보 띠)가 있어요." : undefined) : "시야가 좁은 사람은 한 번에 지름 " + Math.round(viewMm / 10) + "cm만 보여요. 핵심 정보를 보려면 시선을 " + n + "번 옮겨 찾아야 해요. 일시·장소·가격·접근성 정보를 한곳에 모아 주세요." +
        " 자동 수정은 핵심 정보를 한데 모은 '핵심 정보 띠'를 새 글자 레이어로 넣어요 (원래 글자는 그대로).",
      fix: n === 1 ? null : infoStripFix(doc, roles, items, clusters, viewPx, VF),
      alternative: n === 1 ? null : { type: "largePrint", notice: "큰 글씨 안내문에도 핵심 정보를 한곳에 모아 포스터 옆에 함께 붙여 주세요." },
      detail: {
        fieldDeg: env.fieldDeg, viewMm: round(viewMm), viewPx: round(viewPx), clusterCount: n,
        clusters: clusters.map(function (c) { return { box: c.box, ids: c.ids }; }),
        spreadMm: round(Math.hypot(whole.right - whole.left, whole.bottom - whole.top) * mmPerPx),
        layerIds: items.map(function (l) { return l.id; })
      }
    }];
  }

  // ---------------------------------------------------------------- 정보 전달 지도 (검토 우선순위)
  //   글자마다: 중요도(역할) × (1 − 식별 쉬움). 식별 쉬움 = min(크기, 대비) × 위치
  //   판정(통과·실패)이 아니라 '어디부터 고칠지' 보여주는 지도예요.
  // 핵심 정보 띠: 일시 → 장소 → 가격 → 접근성 순서로 글을 모아, 한 번에 보이는 지름 안에 들어가게 줄을 나눠요.
  //   자리는 일시가 있는 묶음 바로 아래 (모자라면 위). 검은 글자 + 흰 판 (대비 기준을 늘 넘어요)
  function infoStripFix(doc, roles, items, clusters, viewPx, VF) {
    var S = VF.strip, W = doc.document.widthPx, H = doc.document.heightPx, ppi = doc.document.ppi || 72;
    var order = VF.roles;
    var keys = items.slice().sort(function (a, b) { return order.indexOf(roles[a.id].role) - order.indexOf(roles[b.id].role); });
    var px = Math.max.apply(null, keys.map(function (l) { return (l.sizePt || 12) * ppi / 72; }));
    var est = function (t) { var w = 0; for (var i = 0; i < t.length; i++) w += /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF]/.test(t[i]) ? S.wideChar : S.narrowChar; return w * px; };
    var maxW = Math.min(viewPx * S.maxWidthOfView, W * 0.9);
    // 글이 길면 글자 크기를 조금 줄이지 않고 줄을 나눠요 (크기는 핵심 정보 중 가장 큰 글자)
    var lines = [], cur = "";
    keys.forEach(function (l) {
      var t = String(l.text).replace(/\s+/g, " ").trim();
      var next = cur ? cur + S.separator + t : t;
      if (cur && est(next) > maxW) { lines.push(cur); cur = t; } else cur = next;
    });
    if (cur) lines.push(cur);
    if (lines.length > S.maxLines) lines = [lines.slice(0, S.maxLines - 1).join(S.separator)].concat(lines.slice(S.maxLines - 1));
    var lineH = px * 1.35, pad = (S.paddingMm / 25.4) * ppi;
    var width = Math.max.apply(null, lines.map(est)), height = lineH * lines.length;
    var dateId = keys.filter(function (l) { return roles[l.id].role === "date"; }).map(function (l) { return l.id; })[0];
    var anchor = clusters.filter(function (c) { return dateId != null && c.ids.indexOf(dateId) >= 0; })[0] ||
      clusters.slice().sort(function (a, b) { return b.ids.length - a.ids.length; })[0];
    var x = Math.max(pad, Math.min(W - width - pad, anchor.box.left));
    var y = anchor.box.bottom + px * S.gap + pad;
    if (y + height + pad > H) y = Math.max(pad, anchor.box.top - px * S.gap - pad - height);
    var font = (keys[0].font && keys[0].font.postScriptName) || null;
    return {
      type: "infoStrip", text: lines.join("\n"), lines: lines, sizePt: round(px * 72 / ppi, 1),
      left: Math.round(x), top: Math.round(y), widthPx: Math.round(width), heightPx: Math.round(height),
      color: S.color, plate: S.plate, plateOpacity: S.plateOpacity, paddingMm: S.paddingMm, fontName: font,
      sourceIds: keys.map(function (l) { return l.id; }), strategy: "gather", passes: true
    };
  }

  function clamp01(n) { return Math.max(0, Math.min(1, n)); }
  function priorityMap(doc, roles, perLayer, P) {
    var M = P.priorityMap;
    if (!M) return [];
    var W = doc.document.widthPx, H = doc.document.heightPx;
    var out = [];
    doc.layers.forEach(function (l) {
      if (l.visible === false || !l.text || !l.text.trim() || !l.bounds) return;
      var r = perLayer[l.id] || {};
      var role = roles[l.id] ? roles[l.id].role : "other";
      var importance = M.importance[role] != null ? M.importance[role] : M.importance.other;
      var sd = r.size && r.size.detail, cd = r.contrast && r.contrast.detail;
      var size = sd && sd.passArcmin ? clamp01(sd.arcmin / sd.passArcmin) : 0.5;
      var contrast = cd && cd.target && cd.worst != null ? clamp01((cd.worst - 1) / (cd.target - 1)) : 0.5;
      var b = l.bounds, band = M.edgeBand;
      var atEdge = b.left < W * band || b.top < H * band || b.right > W * (1 - band) || b.bottom > H * (1 - band);
      var position = atEdge ? M.edgeFactor : 1;
      var legibility = Math.min(size, contrast) * position;
      var score = importance * (1 - legibility);
      out.push({
        layerId: l.id, text: l.text, role: role, roleLabel: R.LABELS[role],
        importance: round(importance, 2),
        legibility: round(legibility, 2),
        parts: { size: round(size, 2), contrast: round(contrast, 2), position: position, atEdge: atEdge },
        weakest: size <= contrast ? "size" : "contrast",
        score: round(score, 3),
        level: score >= M.levels.high ? "high" : score >= M.levels.mid ? "mid" : "low",
        bounds: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }
      });
    });
    return out.sort(function (a, b) { return b.score - a.score; });
  }

  function checkHierarchy(doc, roles, layerResults, docPurpose, P) {
    var out = [];
    var visible = doc.layers.filter(function (l) { return l.visible !== false; });
    var present = {};
    visible.forEach(function (l) { present[roles[l.id].role] = true; });
    P.essentialRoles.forEach(function (role) {
      if (present[role]) return;
      out.push({
        layerId: null,
        check: "hierarchy",
        status: docPurpose === "art" ? "advisory" : "fail",
        metric: R.LABELS[role] + " 정보를 찾지 못했어요",
        message: R.LABELS[role] + "이(가) 포스터에 없거나 이미지로 되어 있어요. 관람에 꼭 필요한 정보예요.",
        detail: { missingRole: role }
      });
    });

    var sizes = visible.map(function (l) { return l.sizePt || 0; }).sort(function (a, b) { return b - a; });
    var median = sizes[Math.floor(sizes.length / 2)] || 0;
    visible.forEach(function (l) {
      var role = roles[l.id].role;
      if (role !== "date" && role !== "place") return;
      // 같은 크기가 여럿이면 '공동 n위'로 보여줘요 (0.1pt 단위로 비교)
      var me = round(l.sizePt || 0, 1);
      var rank = sizes.filter(function (s) { return round(s, 1) > me; }).length + 1;
      var tied = sizes.filter(function (s) { return round(s, 1) === me; }).length;
      var sizeRes = layerResults[l.id] && layerResults[l.id].size;
      var small = (l.sizePt || 0) < median;
      // 저시력은 크기 검사에서 '참고'로 알려줘요. 여기서는 고칠 수 없는 경고를 남기지 않아요
      var lowVision = sizeRes && sizeRes.detail.lowVisionReadable;
      out.push({
        layerId: l.id,
        layerName: l.name,
        text: l.text,
        role: role,
        check: "hierarchy",
        status: small ? "warn" : "pass",
        metric: R.LABELS[role] + " · 크기 " + (tied > 1 ? "공동 " : "") + rank + "위 (글자 " + sizes.length + "개 중" + (tied > 1 ? ", 같은 크기 " + tied + "개" : "") + ")" +
          (small ? " · 중간 크기보다 작아요" : ""),
        message: small ? R.LABELS[role] + "이(가) 다른 글자보다 작아요. 눈에 잘 띄게 키우거나 굵게 해 주세요." : undefined,
        detail: { role: role, rank: rank, tied: tied, total: sizes.length, smallerThanMedian: small, lowVisionReadable: lowVision }
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- 전체
  function checkDocument(doc, envInput, policies) {
    var P = policies || DEFAULT_POLICIES;
    var env = resolveEnv(envInput, P, doc);
    var layers = doc.layers.filter(function (l) { return l.visible !== false && l.text && l.text.trim(); });
    var roles = R.classify(doc.layers);
    var sug = suggestPurposes(layers, roles);
    var docPurpose = doc.document.purpose || sug.document;
    var altText = R.altTextDraft(doc.layers, roles);

    var results = [];
    var perLayer = {};
    layers.forEach(function (l) {
      l.purposeSuggested = sug.layers[l.id];
      // 실제 목적: 디자이너가 정한 값 → 없으면 문서 목적(복합이 아니면) → 추천값
      var purpose = l.purpose || (docPurpose !== "mixed" ? docPurpose : null) || sug.layers[l.id];
      var source = l.purpose ? l.purposeSource || "designer" : "suggested";
      var pol = P.purposes[purpose];
      var common = {
        layerId: l.id,
        layerName: l.name,
        text: l.text,
        role: roles[l.id].role,
        purpose: purpose,
        purposeSource: source
      };
      var size = Object.assign({}, common, checkSize(l, env, pol, P, doc, roles[l.id].role));
      var contrast = Object.assign({}, common, checkContrast(l, env, pol, P, purpose, docPurpose, altText));
      perLayer[l.id] = { size: size, contrast: contrast };
      results.push(size, contrast);
      if (env.colorVision) {
        var cvd = checkCvdContrast(l, contrast, pol, P);
        if (cvd) results.push(Object.assign({}, common, cvd));
        var colorOnly = checkColorOnly(l, contrast, pol, P);
        if (colorOnly) results.push(Object.assign({}, common, colorOnly));
      }
      var font = checkFont(l, pol, P);
      if (font) results.push(Object.assign({}, common, font));
      var weight = checkWeight(l, pol, P);
      if (weight) results.push(Object.assign({}, common, weight));
      var spacing = checkSpacing(l, pol, P);
      if (spacing) results.push(Object.assign({}, common, spacing));
    });
    results = results.concat(checkLayout(doc, layers, perLayer, P));
    results = results.concat(checkHierarchy(doc, roles, perLayer, docPurpose, P));
    results = results.concat(checkGrouping(doc, roles, docPurpose, P));
    results = results.concat(checkField(doc, roles, env, docPurpose, P));
    results.forEach(function (r) { r.statusLabel = STATUS_LABELS[r.status]; });
    results.sort(function (a, b) { return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; });

    var counts = { pass: 0, warn: 0, fail: 0, advisory: 0, conflict: 0 };
    results.forEach(function (r) { counts[r.status]++; });
    var needsWork = counts.fail + counts.conflict + counts.warn > 0;

    return {
      engineVersion: "0.2",
      policyVersion: P.version,
      environment: env,
      document: {
        key: doc.document.key,
        purpose: docPurpose,
        purposeSource: doc.document.purpose ? "designer" : "suggested",
        purposeSuggested: sug.document
      },
      summary: {
        counts: counts,
        applyAllAllowed: docPurpose !== "art",
        accessibleVersionRecommended: docPurpose !== "art" && needsWork,
        alternativeRecommended: counts.conflict > 0 || (docPurpose === "art" && counts.advisory > 0),
        largePrintRecommended: results.some(function (r) { return r.alternative && r.alternative.type === "largePrint"; })
      },
      altTextDraft: altText,
      priority: priorityMap(doc, roles, perLayer, P),
      roles: Object.keys(roles).reduce(function (o, id) { o[id] = roles[id].role; return o; }, {}),
      results: results
    };
  }

  /*
   * 검사 결과 → A 의 수정 목록 (docs/apply-fixes.md)
   *   기본: 실패·주의·충돌 중 기준을 넘는 수정(passes: true)만. 예술 '참고'는 opts.includeAdvisory 로.
   *   한 레이어에 같은 종류 수정이 여럿이면 처음 것만.
   *   키우면 다른 글자와 겹치거나 포스터 밖으로 나가는 크기 수정(fix.layoutWarning)은 기본으로 빼요.
   *     → 디자이너가 위치를 옮긴 뒤 직접 켜도록. 넣으려면 opts.includeLayoutConflicts.
   */
  function toApplyFixes(result, opts) {
    opts = opts || {};
    var seen = {}, out = [];
    result.results.forEach(function (r) {
      if (!r.fix || (r.layerId == null && r.fix.type !== "infoStrip")) return;
      if (r.fix.passes === false && !opts.includeFailing) return;
      if (r.status === "pass") return;
      if (r.status === "advisory" && !opts.includeAdvisory) return;
      if (r.fix.layoutWarning && !opts.includeLayoutConflicts) return;
      var key = r.layerId + ":" + r.fix.type;
      if (seen[key]) return;
      seen[key] = true;
      var f = { layerId: r.layerId, type: r.fix.type, reason: r.metric };
      if (r.fix.type === "color") { f.value = r.fix.value; if (r.fix.runs) f.runs = r.fix.runs; }
      if (r.fix.type === "size") f.valuePt = r.fix.valuePt;
      if (r.fix.type === "backplate") { f.color = r.fix.color; f.opacity = r.fix.opacity; f.paddingMm = r.fix.paddingMm; }
      if (r.fix.type === "weight") f.fauxBold = true;
      if (r.fix.type === "emphasis") f.runs = r.fix.runs;
      if (r.fix.type === "infoStrip") ["text", "sizePt", "left", "top", "color", "plate", "plateOpacity", "paddingMm", "fontName", "sourceIds"].forEach(function (k) { f[k] = r.fix[k]; });
      if (r.fix.type === "spacing") {
        if (r.fix.lineHeight != null) f.lineHeight = r.fix.lineHeight;
        if (r.fix.letterSpacingEm != null) f.letterSpacingEm = r.fix.letterSpacingEm;
      }
      out.push(f);
    });
    return out;
  }

  return {
    checkDocument: checkDocument,
    toApplyFixes: toApplyFixes,
    suggestPurposes: suggestPurposes,
    STATUS_LABELS: STATUS_LABELS,
    DEFAULT_POLICIES: DEFAULT_POLICIES
  };
});
