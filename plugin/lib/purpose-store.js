/*
 * purpose-store.js — 디자이너가 고른 '목적'(예술적 표현 / 정보 전달 / 복합)을 PSD 안에 저장하고 불러와요.
 *
 * 저장 위치: PSD의 XMP 메타데이터 (파일 정보). 포토샵이 저장할 때도 그대로 남아서
 *            파일을 다른 사람에게 보내도 목적 정보가 따라가요.
 * 같은 파일을 플러그인·PSD 변환기·브라우저가 같이 써요 (UMD, 의존성 없음).
 *
 * 저장 형식 (purposeInfo)
 *   {
 *     "version": 1,
 *     "document": "mixed",                // "art" | "info" | "mixed" | null
 *     "groups":   { "3": "art" },          // 복합일 때 그룹 ID → "art" | "info"
 *     "layers":   { "5": "info" },         // 복합일 때 레이어 ID → "art" | "info" (그룹보다 우선)
 *     "updatedAt": "2026-11-15T10:00:00.000Z"
 *   }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PurposeStore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // XMP 이름표(네임스페이스). 실제 주소가 아니라 이 프로젝트 데이터라는 표시예요.
  var NS = "urn:poster-a11y:purposes:1.0";
  var TAG = "pa11y:purposes";
  var DOC_PURPOSES = ["art", "info", "mixed"];
  var PART_PURPOSES = ["art", "info"];
  var LABELS = { art: "예술적 표현", info: "정보 전달", mixed: "복합 목적" };

  function escapeXml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function unescapeXml(s) {
    return s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  }

  function empty() {
    return { version: 1, document: null, groups: {}, layers: {}, updatedAt: null };
  }

  // 잘못된 값은 버리고 형식을 맞춰요
  function normalize(info) {
    var out = empty();
    if (!info || typeof info !== "object") return out;
    if (DOC_PURPOSES.indexOf(info.document) >= 0) out.document = info.document;
    ["groups", "layers"].forEach(function (k) {
      var src = info[k] || {};
      Object.keys(src).forEach(function (id) {
        if (PART_PURPOSES.indexOf(src[id]) >= 0 && /^\d+$/.test(String(id))) out[k][String(id)] = src[id];
      });
    });
    out.updatedAt = info.updatedAt || null;
    return out;
  }

  // XMP 문자열 → purposeInfo (없으면 null)
  function parseXmp(xmp) {
    if (!xmp) return null;
    var m = new RegExp("<" + TAG + ">([\\s\\S]*?)</" + TAG + ">").exec(xmp);
    if (!m) return null;
    try {
      return normalize(JSON.parse(unescapeXml(m[1].trim())));
    } catch (e) {
      return null;
    }
  }

  var BLOCK_RE = new RegExp('\\s*<rdf:Description[^>]*xmlns:pa11y="' + NS.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + '"[\\s\\S]*?</rdf:Description>', "g");

  // 기존 XMP에 목적 정보를 넣거나 바꿔요. 다른 메타데이터(작성자, 색 프로필 등)는 그대로 둬요.
  function mergeIntoXmp(xmp, info) {
    var data = normalize(info);
    data.updatedAt = new Date().toISOString();
    var block =
      '\n   <rdf:Description rdf:about="" xmlns:pa11y="' + NS + '">\n' +
      "    <" + TAG + ">" + escapeXml(JSON.stringify(data)) + "</" + TAG + ">\n" +
      "   </rdf:Description>";
    if (xmp && xmp.indexOf("</rdf:RDF>") >= 0) {
      return xmp.replace(BLOCK_RE, "").replace("</rdf:RDF>", block + "\n  </rdf:RDF>");
    }
    return (
      '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
      '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      block +
      "\n  </rdf:RDF>\n</x:xmpmeta>\n" +
      '<?xpacket end="w"?>'
    );
  }

  // ag-psd 로 읽은 PSD 객체에서 읽기·쓰기
  function readFromPsd(psd) {
    return parseXmp(psd && psd.imageResources && psd.imageResources.xmpMetadata);
  }
  function writeToPsd(psd, info) {
    psd.imageResources = psd.imageResources || {};
    psd.imageResources.xmpMetadata = mergeIntoXmp(psd.imageResources.xmpMetadata, info);
    return psd;
  }

  /*
   * 레이어마다 실제로 적용되는 목적을 정해요.
   *   - 문서 목적이 art/info 이면 모든 레이어가 그 목적 (source: "document")
   *   - 복합(mixed)이면 레이어 지정 → 가장 가까운 그룹 지정 순서로 찾고, 없으면 null (아직 안 고름)
   * layer.groupIds: 위 그룹부터 차례대로 그룹 ID 목록
   */
  function resolve(info, layer) {
    info = normalize(info);
    if (!info.document) return { purpose: null, source: null };
    if (info.document !== "mixed") return { purpose: info.document, source: "document" };
    var own = info.layers[String(layer.id)];
    if (own) return { purpose: own, source: "layer" };
    var ids = layer.groupIds || [];
    for (var i = ids.length - 1; i >= 0; i--) {
      var g = info.groups[String(ids[i])];
      if (g) return { purpose: g, source: "group" };
    }
    return { purpose: null, source: null };
  }

  // 공통 레이어 데이터(문서 JSON)에 목적을 채워요
  function applyToDocument(doc, info) {
    var norm = normalize(info);
    doc.document.purpose = norm.document;
    doc.purposes = norm;
    (doc.groups || []).forEach(function (g) {
      g.purpose = norm.groups[String(g.id)] || null;
    });
    (doc.layers || []).forEach(function (l) {
      var r = resolve(norm, l);
      l.purpose = r.purpose;
      l.purposeSource = r.source;
    });
    return doc;
  }

  return {
    NS: NS,
    LABELS: LABELS,
    DOC_PURPOSES: DOC_PURPOSES,
    PART_PURPOSES: PART_PURPOSES,
    empty: empty,
    normalize: normalize,
    parseXmp: parseXmp,
    mergeIntoXmp: mergeIntoXmp,
    readFromPsd: readFromPsd,
    writeToPsd: writeToPsd,
    resolve: resolve,
    applyToDocument: applyToDocument
  };
});
