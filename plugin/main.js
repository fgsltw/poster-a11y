/*
 * 포스터 접근성 검수 — 포토샵 연동(기술 A) 1주차 코드
 *
 * 하는 일
 *   1) 열린 문서의 해상도·크기와 텍스트 레이어(내용, 크기, 굵기, 색, 투명도, 혼합 모드, 위치, 그룹)를 읽어요.
 *   2) 글자 레이어를 잠시 숨기고 그 아래 합성 픽셀을 읽어 배경을 요약해요.
 *   3) 결과를 PSD 변환기와 '같은 형식'의 JSON으로 저장해요 (docs/layer-data.md).
 *   4) 11/19 가능성 확인 항목을 패널에 보여줘요.
 *
 * 이 코드는 포토샵 없이 작성되어 아직 실제 포토샵에서 실행해 보지 않았어요.
 * docs/feasibility-checklist.md 순서대로 확인하면서 고쳐 주세요.
 */
const { app, core, imaging, action, constants } = require("photoshop");
const { storage, entrypoints } = require("uxp");
const LD = require("./lib/layer-data.js");

entrypoints.setup({ panels: { mainPanel: { show() {} } } });

let lastResult = null;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- 도우미

function unitValue(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "_value" in v) return v._value;
  return null;
}

function colorDescToHex(c) {
  if (!c) return null;
  // 포토샵 batchPlay 의 RGB 는 초록을 'grain' 이라고 불러요.
  if (c._obj === "RGBColor" || "red" in c) {
    const g = c.grain != null ? c.grain : c.green;
    return LD.toHex(c.red, g, c.blue);
  }
  // CMYK 는 % 단위로 와요. ⚠ 확인 필요: 필드 이름(cyan, magenta, yellowColor, black)
  if (c._obj === "CMYKColorClass" || "cyan" in c) {
    const rgb = LD.cmykToRgb(c.cyan / 100, c.magenta / 100, (c.yellowColor != null ? c.yellowColor : c.yellow) / 100, c.black / 100);
    return LD.toHex(rgb.r, rgb.g, rgb.b);
  }
  return null; // Lab 등은 아직 지원하지 않음 → 경고
}

function isText(layer) {
  return layer.kind === constants.LayerKind.TEXT || layer.kind === "text";
}
function isGroup(layer) {
  return layer.kind === constants.LayerKind.GROUP || layer.kind === "group";
}

function boundsOf(layer) {
  const b = layer.bounds; // 문서 픽셀 좌표
  const r = { left: Math.floor(b.left), top: Math.floor(b.top), right: Math.ceil(b.right), bottom: Math.ceil(b.bottom) };
  return r.right > r.left && r.bottom > r.top ? r : null;
}

function docKeyOf(doc) {
  // 문서 ID(doc.id)는 포토샵을 다시 열면 바뀌어요. 저장용 키는 파일 경로를 씁니다.
  return doc.path ? String(doc.path) : "unsaved:" + doc.name;
}

// 텍스트 정보는 DOM 보다 batchPlay 가 자세해요 (implied 크기, 변형, 색 공간 등).
async function getTextDesc(docId, layerId) {
  const [desc] = await action.batchPlay(
    [{ _obj: "get", _target: [{ _ref: "layer", _id: layerId }, { _ref: "document", _id: docId }], _options: { dialogOptions: "dontDisplay" } }],
    {}
  );
  return desc;
}

function dominantRange(textKey) {
  const ranges = (textKey && textKey.textStyleRange) || [];
  if (!ranges.length) return null;
  return ranges.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
}

// 픽셀 읽기 결과를 summarizeBackground 가 받는 모양으로 바꿔요.
async function readPixels(opts) {
  const res = await imaging.getPixels(Object.assign({ componentSize: 8, colorSpace: "RGB" }, opts));
  try {
    const data = await res.imageData.getData({ chunky: true });
    return {
      data,
      width: res.imageData.width,
      height: res.imageData.height,
      components: res.imageData.components,
      originX: res.sourceBounds ? res.sourceBounds.left : opts.sourceBounds.left,
      originY: res.sourceBounds ? res.sourceBounds.top : opts.sourceBounds.top
    };
  } finally {
    res.imageData.dispose();
  }
}

// ---------------------------------------------------------------- 문서 읽기

async function readDocument() {
  const doc = app.activeDocument;
  if (!doc) throw new Error("열린 문서가 없어요.");

  const ppi = doc.resolution;
  const docKey = docKeyOf(doc);
  const checks = [];
  const groups = [];
  const textLayers = [];
  const warnings = [];

  checks.push({
    name: "문서 정보",
    ok: !!ppi && doc.width > 0,
    detail: `${doc.width}×${doc.height}px · ${ppi}ppi · 인쇄 ${LD.round(LD.pxToMm(doc.width, ppi), 1)}×${LD.round(LD.pxToMm(doc.height, ppi), 1)}mm`
  });
  checks.push({
    name: "저장 키 (문서 ID 대신 경로)",
    ok: !!doc.path,
    todo: !doc.path,
    detail: doc.path ? `doc.id=${doc.id} · path=${doc.path}` : "저장되지 않은 문서예요. 저장 후 다시 확인하세요."
  });
  if (doc.mode && String(doc.mode).toLowerCase().indexOf("rgb") < 0) warnings.push(`문서 색상 모드가 RGB가 아니에요 (${doc.mode}). 색 변환을 확인해야 해요.`);

  // 1) 레이어 구조 훑기 — doc.layers 는 위 레이어부터 와요.
  (function walk(list, path) {
    for (const layer of list) {
      if (isGroup(layer)) {
        groups.push({ id: layer.id, name: layer.name, groupPath: path.slice(), visible: layer.visible });
        walk(layer.layers || [], path.concat([layer.name]));
      } else if (isText(layer)) {
        textLayers.push({ layer, path: path.slice() });
      }
    }
  })(doc.layers, []);

  checks.push({ name: "텍스트 레이어 찾기", ok: textLayers.length > 0, detail: `${textLayers.length}개 · 그룹 ${groups.length}개` });

  // 2) 텍스트 속성 읽기
  const layers = [];
  let sizeSample = null;
  for (const { layer, path } of textLayers) {
    const lw = [];
    let desc = null;
    try {
      desc = await getTextDesc(doc.id, layer.id);
    } catch (e) {
      lw.push("텍스트 속성을 읽지 못했어요: " + e.message);
    }
    const tk = desc && desc.textKey;
    const range = dominantRange(tk);
    const ts = (range && range.textStyle) || {};

    const sizeRaw = unitValue(ts.size);
    const impliedRaw = unitValue(ts.impliedFontSize);
    const t = tk && tk.transform;
    const scaleY = t ? Math.sqrt(t.yx * t.yx + t.yy * t.yy) || 1 : 1;

    // ⚠ 확인 필요: size 값이 '포인트'인지 '72ppi 기준 픽셀'인지 포토샵 버전에 따라 다르다는 보고가 있어요.
    //   지금은 포인트로 보고 px = pt × ppi / 72 로 바꿔요. 캐릭터 패널 값과 비교해서 확정하세요.
    const effectivePt = impliedRaw != null ? impliedRaw : sizeRaw != null ? sizeRaw * scaleY : null;
    const sizePx = effectivePt != null ? LD.ptToPx(effectivePt, ppi) : null;
    if (!sizeSample && sizeRaw != null) sizeSample = { name: layer.name, sizeRaw, impliedRaw, scaleY: LD.round(scaleY, 4) };

    const color = colorDescToHex(ts.color);
    if (!color) lw.push("글자 색을 RGB로 읽지 못했어요.");

    const colorRuns = [];
    for (const r of (tk && tk.textStyleRange) || []) {
      const hex = colorDescToHex(r.textStyle && r.textStyle.color);
      if (hex && colorRuns.indexOf(hex) < 0) colorRuns.push(hex);
    }

    const built = LD.buildTextLayer({
      id: layer.id,
      docKey,
      name: layer.name,
      groupPath: path,
      text: (tk && tk.textKey) || (layer.textItem && layer.textItem.contents) || "",
      fontName: ts.fontName,
      fontPostScriptName: ts.fontPostScriptName,
      fontStyleName: ts.fontStyleName,
      fauxBold: !!ts.syntheticBold,
      sizePx,
      sizeSourcePx: sizeRaw != null ? LD.ptToPx(sizeRaw, ppi) : null,
      scale: impliedRaw != null && sizeRaw ? impliedRaw / sizeRaw : scaleY,
      color,
      colorRuns,
      opacity: layer.opacity / 100,
      fillOpacity: layer.fillOpacity != null ? layer.fillOpacity / 100 : 1,
      blendMode: String(layer.blendMode || "normal").toLowerCase(),
      visible: layer.visible,
      bounds: boundsOf(layer),
      background: null,
      ppi,
      warnings: lw
    });
    built.sizeDetail.raw = { size: sizeRaw, impliedFontSize: impliedRaw, transform: t || null, unitAssumed: "points" };
    layers.push(built);
  }

  checks.push({
    name: "글자 크기 단위 (캐릭터 패널과 비교)",
    todo: true,
    ok: !!sizeSample,
    detail: sizeSample
      ? `'${sizeSample.name}' size=${sizeSample.sizeRaw}, implied=${sizeSample.impliedRaw}, 변형=${sizeSample.scaleY} → 캐릭터 패널의 pt 값과 같은지 확인`
      : "크기 정보를 못 읽었어요."
  });
  const colorOk = layers.filter((l) => l.color).length;
  checks.push({ name: "글자 색 읽기", ok: colorOk === layers.length, detail: `${colorOk}/${layers.length}개 RGB로 읽음` });

  // 3) 배경 픽셀 읽기 — 글자 레이어를 잠시 숨기고 합성 픽셀을 읽어요. 실행 취소 기록은 남기지 않아요.
  const t0 = Date.now();
  let bgOk = 0;
  const bgErrors = [];
  await core.executeAsModal(
    async (ctx) => {
      const historyId = await ctx.hostControl.suspendHistory({ documentID: doc.id, name: "접근성 검사용 읽기" });
      try {
        for (let i = 0; i < textLayers.length; i++) {
          const layer = textLayers[i].layer;
          const out = layers[i];
          const b = out.bounds && { left: out.bounds.left, top: out.bounds.top, right: out.bounds.right, bottom: out.bounds.bottom };
          if (!b) continue;
          const wasVisible = layer.visible;
          try {
            layer.visible = false;
            const comp = await readPixels({ documentID: doc.id, sourceBounds: b });
            out.background = LD.summarizeBackground(comp, null, b, { method: "photoshop-hide-text-layer", compositeHasText: false });
            bgOk++;
          } catch (e) {
            bgErrors.push(`${layer.name}: ${e.message}`);
            out.warnings.push("배경 픽셀을 읽지 못했어요: " + e.message);
          } finally {
            layer.visible = wasVisible;
          }
        }
      } finally {
        // false = 이번 작업을 기록에 남기지 않고 되돌려요 (숨김/표시 변경 포함).
        await ctx.hostControl.resumeHistory(historyId, false);
      }
    },
    { commandName: "접근성 검사용 문서 읽기" }
  );
  const ms = Date.now() - t0;
  checks.push({
    name: "배경 픽셀 읽기 (레이어 숨김 → 합성)",
    ok: bgOk === layers.filter((l) => l.bounds).length && bgErrors.length === 0,
    detail: `${bgOk}개 성공 · ${ms}ms (레이어당 ${layers.length ? Math.round(ms / layers.length) : 0}ms)` + (bgErrors.length ? ` · 오류: ${bgErrors.join(" / ")}` : "")
  });
  checks.push({
    name: "작업 내역(History)에 기록이 남지 않았는지",
    todo: true,
    ok: true,
    detail: "포토샵 '작업 내역' 패널을 열어 새 항목이 생기지 않았는지, 숨긴 레이어가 다시 보이는지 눈으로 확인"
  });

  const result = LD.buildDocument({
    source: "photoshop",
    docKey,
    name: doc.name,
    path: doc.path || null,
    widthPx: doc.width,
    heightPx: doc.height,
    ppi,
    groups,
    layers,
    warnings
  });
  result.document.photoshopDocumentId = doc.id;
  return { result, checks };
}

// ---------------------------------------------------------------- 레이어 선택 (결과 항목 → 포토샵)

async function selectLayer(layerId) {
  await core.executeAsModal(
    () => action.batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _id: layerId }], makeVisible: false, _options: { dialogOptions: "dontDisplay" } }], {}),
    { commandName: "레이어 선택" }
  );
}

// ---------------------------------------------------------------- 화면

function renderChecks(checks) {
  $("checks").innerHTML = checks
    .map((c) => {
      const cls = c.todo ? "todo" : c.ok ? "ok" : "fail";
      const mark = c.todo ? "?" : c.ok ? "✓" : "✗";
      return `<div class="check"><div class="mark ${cls}">${mark}</div><div class="body"><b>${esc(c.name)}</b><br>${esc(c.detail)}</div></div>`;
    })
    .join("");
}

function renderLayers(result) {
  $("layers").innerHTML = result.layers
    .map((l) => {
      const s = l.background && l.background.stats;
      return (
        `<div class="layer" data-id="${l.id}"><b>${esc(l.text.slice(0, 30))}</b> <span class="meta">${esc(l.groupPath.join(" / "))}</span><br>` +
        `${l.sizePt}pt · <span class="sw" style="background-color:${l.color}"></span>${l.color} · 투명도 ${Math.round(l.opacity * 100)}%` +
        (s ? `<br>배경 <span class="sw" style="background-color:${s.darkestColor}"></span>${s.darkestColor} ~ <span class="sw" style="background-color:${s.lightestColor}"></span>${s.lightestColor}` : "") +
        (l.warnings.length ? `<br><span class="todo">⚠ ${esc(l.warnings.join(" / "))}</span>` : "") +
        `</div>`
      );
    })
    .join("");
  document.querySelectorAll(".layer").forEach((el) => {
    el.addEventListener("click", () => selectLayer(Number(el.getAttribute("data-id"))).catch((e) => ($("status").textContent = e.message)));
  });
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

$("btnRead").addEventListener("click", async () => {
  $("status").textContent = "읽는 중…";
  try {
    const { result, checks } = await readDocument();
    lastResult = result;
    renderChecks(checks);
    renderLayers(result);
    $("btnSave").removeAttribute("disabled");
    $("status").textContent = `텍스트 레이어 ${result.layers.length}개를 읽었어요.` + (result.warnings.length ? " ⚠ " + result.warnings.join(" ") : "");
  } catch (e) {
    console.error(e);
    $("status").textContent = "실패: " + e.message;
  }
});

$("btnSave").addEventListener("click", async () => {
  if (!lastResult) return;
  try {
    const base = String(lastResult.document.name || "document").replace(/\.[^.]+$/, "");
    const file = await storage.localFileSystem.getFileForSaving(base + ".layers.json", { types: ["json"] });
    if (!file) return;
    await file.write(JSON.stringify(lastResult, null, 2));
    $("status").textContent = "저장했어요: " + file.name;
  } catch (e) {
    $("status").textContent = "저장 실패: " + e.message;
  }
});
