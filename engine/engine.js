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
      // SNS: 휴대폰 화면 너비에 맞춰 보이는 크기
      displayScaleMmPerPx: base.screenWidthMm ? base.screenWidthMm / doc.document.widthPx : null
    };
  }

  // ---------------------------------------------------------------- 글자 크기
  function checkSize(l, env, pol, P, doc) {
    var S = P.size;
    var glyphPx = (l.sizePx || 0) * S.glyphHeightRatio;
    var glyphMm = env.displayScaleMmPerPx ? glyphPx * env.displayScaleMmPerPx : (glyphPx / doc.document.ppi) * 25.4;
    var angle = Math.atan(glyphMm / (env.distanceM * 1000)) / ARCMIN;

    var status = angle >= S.passArcmin ? "pass" : angle >= S.warnArcmin ? "warn" : "fail";
    if (status !== "pass" && pol.judge === "advisory") status = "advisory";

    // 통과하려면 몇 pt 가 필요한지 (인쇄 pt 기준. SNS는 문서 pt 로 바꿔서)
    var needGlyphMm = Math.tan(S.passArcmin * ARCMIN) * env.distanceM * 1000;
    var needEmPx = env.displayScaleMmPerPx
      ? needGlyphMm / S.glyphHeightRatio / env.displayScaleMmPerPx
      : ((needGlyphMm / S.glyphHeightRatio) / 25.4) * doc.document.ppi;
    var recommendedPt = ceilHalf((needEmPx * 72) / doc.document.ppi);
    var lowVisionOk = angle * S.lowVisionAcuity >= S.readableArcminAt1_0;

    var res = {
      check: "size",
      status: status,
      metric: "글자 높이 " + round(glyphMm, 1) + "mm · " + env.distanceM + "m에서 " + round(angle, 1) + "′ (기준 " + S.passArcmin + "′)",
      detail: { glyphMm: round(glyphMm, 2), arcmin: round(angle, 2), recommendedPt: recommendedPt, lowVisionReadable: lowVisionOk },
      fix: null
    };
    if (status !== "pass") {
      res.message = pol.messages.size;
      if (pol.fix.allowSize) res.fix = { type: "size", valuePt: recommendedPt, strategy: pol.fix.strategy, passes: true };
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

  // 배경 띠: 흰색·짙은색 중 나은 쪽, 정책이 허락하는 불투명도에서 기준을 넘는지
  function tryBackplate(textRgb, bgs, alpha, target, maxOpacity, P) {
    var best = null;
    ["#FFFFFF", "#1B1A22"].forEach(function (hex) {
      var plate = C.hexToRgb(hex);
      var under = bgs.map(function (bg) { return C.blend(plate, bg, maxOpacity); });
      var cs = contrastsFor(textRgb, under, alpha);
      var worst = percentile(cs, P.contrast.worstPercentile);
      if (!best || worst > best.contrast) best = { color: hex, opacity: maxOpacity, contrast: worst };
    });
    best.passes = best.contrast >= target;
    return best;
  }

  function checkContrast(l, env, pol, P, policyKey, docPurpose, altText) {
    var textRgb = C.hexToRgb(l.color);
    var bgs = backgroundRgbs(l);
    if (!textRgb || !bgs) {
      return { check: "contrast", status: "warn", metric: "글자색이나 배경을 읽지 못해 대비를 계산하지 못했어요", detail: {}, fix: null };
    }
    var alpha = l.opacity == null ? 1 : l.opacity;
    var cs = contrastsFor(textRgb, bgs, alpha);
    var worst = percentile(cs, P.contrast.worstPercentile);
    var bold = l.font && l.font.weightGuess === "bold";
    var large = l.sizePt >= P.contrast.largePt || (bold && l.sizePt >= P.contrast.largeBoldPt);
    var dim = env.lighting === "dim" && policyKey === "info";
    var target = large ? (dim ? P.contrast.dimLarge : P.contrast.large) : dim ? P.contrast.dimNormal : P.contrast.normal;
    var complexity = complexityOf(l, P);

    var status = worst >= target ? "pass" : "fail";
    if (status === "fail" && pol.judge === "advisory") status = "advisory";

    var res = {
      check: "contrast",
      status: status,
      metric: "대비 " + round(worst, 1) + ":1 · 기준 " + target + ":1" + (large ? " (큰 글자)" : "") + " · " + COMPLEXITY_LABELS[complexity],
      detail: { worst: round(worst, 2), min: round(cs[0], 2), target: target, large: large, complexity: complexity, dimLighting: dim },
      fix: null,
      alternative: null
    };
    if (l.blendMode && l.blendMode !== "normal") res.detail.note = "혼합 모드(" + l.blendMode + ") 때문에 실제 보이는 색이 다를 수 있어요";
    if (status === "pass") return res;
    res.message = pol.messages.contrast;

    // 1) 같은 색상에서 밝기만 바꾸기
    var bgLums = cs.length ? bgs.map(C.luminance).sort(function (a, b) { return a - b; }) : [];
    // 아주 드문 얼룩 픽셀(아래·위 2%)은 빼고 찾아요
    var cut = Math.floor(bgLums.length * P.contrast.worstPercentile);
    var lums = bgLums.slice(cut, bgLums.length - cut || bgLums.length);
    var color = C.findAccessibleColor(l.color, lums, target, { maxShift: pol.fix.maxLightnessShift, alpha: alpha, bgRgbs: alpha < 1 ? bgs : null });
    if (color && color.passes) {
      res.fix = { type: "color", value: color.hex, strategy: pol.fix.strategy, passes: true, contrastAfter: round(color.contrast, 2) };
      return res;
    }

    // 2) 글자 뒤 배경 띠 (복합 목적에서 그림 위 정보 글자는 그림을 가리지 않도록 막아요)
    var overArt = complexity === "busy";
    var plateAllowed = pol.fix.allowBackplate && !(docPurpose === "mixed" && overArt && !P.purposes.mixed.allowBackplateOverArt);
    if (plateAllowed) {
      var plate = tryBackplate(textRgb, bgs, alpha, target, pol.fix.backplateMaxOpacity, P);
      if (plate.passes) {
        res.fix = { type: "backplate", color: plate.color, opacity: plate.opacity, paddingMm: 1.5, strategy: pol.fix.strategy, passes: true, contrastAfter: round(plate.contrast, 2) };
        return res;
      }
    }

    // 3) 고쳐도 기준을 못 넘음 → 가장 나은 수정 + 대체 정보
    if (color) res.fix = { type: "color", value: color.hex, strategy: "minimal", passes: false, contrastAfter: round(color.contrast, 2) };
    if (policyKey === "info" && docPurpose === "mixed") {
      res.status = "conflict";
      res.message = "정보 글자가 예술 이미지 위에 있어서, 그림을 가리지 않고는 기준을 넘기 어려워요. 같은 정보를 다른 곳(대체텍스트, 별도 안내문)에서도 제공해 주세요.";
    }
    if (res.status === "conflict" || pol.support === "alternative") {
      res.alternative = { type: "altText", draft: altText, notice: "포스터 아래나 SNS 본문에 같은 정보를 글로 함께 적어 주세요." };
    }
    return res;
  }

  // ---------------------------------------------------------------- 핵심 정보 위계
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
      var rank = sizes.indexOf(l.sizePt) + 1;
      var sizeRes = layerResults[l.id] && layerResults[l.id].size;
      var small = (l.sizePt || 0) < median;
      var lowVision = sizeRes && sizeRes.detail.lowVisionReadable;
      out.push({
        layerId: l.id,
        layerName: l.name,
        text: l.text,
        role: role,
        check: "hierarchy",
        status: small || lowVision === false ? "warn" : "pass",
        metric: R.LABELS[role] + " · 크기 순위 " + rank + "/" + sizes.length + (lowVision === false ? " · 저시력(0.3)에서 읽기 어려움" : ""),
        message: small ? R.LABELS[role] + "이(가) 다른 글자보다 작아요. 눈에 잘 띄게 키우거나 굵게 해 주세요." : undefined,
        detail: { role: role, rank: rank, total: sizes.length, smallerThanMedian: small, lowVisionReadable: lowVision }
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
      var size = Object.assign({}, common, checkSize(l, env, pol, P, doc));
      var contrast = Object.assign({}, common, checkContrast(l, env, pol, P, purpose, docPurpose, altText));
      perLayer[l.id] = { size: size, contrast: contrast };
      results.push(size, contrast);
    });
    results = results.concat(checkHierarchy(doc, roles, perLayer, docPurpose, P));
    results.forEach(function (r) { r.statusLabel = STATUS_LABELS[r.status]; });
    results.sort(function (a, b) { return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; });

    var counts = { pass: 0, warn: 0, fail: 0, advisory: 0, conflict: 0 };
    results.forEach(function (r) { counts[r.status]++; });
    var needsWork = counts.fail + counts.conflict + counts.warn > 0;

    return {
      engineVersion: "0.1",
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
        alternativeRecommended: counts.conflict > 0 || (docPurpose === "art" && counts.advisory > 0)
      },
      altTextDraft: altText,
      roles: Object.keys(roles).reduce(function (o, id) { o[id] = roles[id].role; return o; }, {}),
      results: results
    };
  }

  /*
   * 검사 결과 → A 의 수정 목록 (docs/apply-fixes.md)
   *   기본: 실패·주의·충돌 중 기준을 넘는 수정(passes: true)만. 예술 '참고'는 opts.includeAdvisory 로.
   *   한 레이어에 같은 종류 수정이 여럿이면 처음 것만.
   */
  function toApplyFixes(result, opts) {
    opts = opts || {};
    var seen = {}, out = [];
    result.results.forEach(function (r) {
      if (!r.fix || r.layerId == null) return;
      if (r.fix.passes === false && !opts.includeFailing) return;
      if (r.status === "pass") return;
      if (r.status === "advisory" && !opts.includeAdvisory) return;
      var key = r.layerId + ":" + r.fix.type;
      if (seen[key]) return;
      seen[key] = true;
      var f = { layerId: r.layerId, type: r.fix.type, reason: r.metric };
      if (r.fix.type === "color") f.value = r.fix.value;
      if (r.fix.type === "size") f.valuePt = r.fix.valuePt;
      if (r.fix.type === "backplate") { f.color = r.fix.color; f.opacity = r.fix.opacity; f.paddingMm = r.fix.paddingMm; }
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
