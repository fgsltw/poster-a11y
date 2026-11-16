# 레이어 데이터 형식 (A → B 약속) · v0.5

포토샵 연동(기술 A)이 검사 엔진(기술 B)에 넘기는 데이터예요.
**포토샵 플러그인**과 **PSD 변환기**가 똑같은 형식을 내보내요. 그래서 B와 C는 포토샵이 없어도 PSD 변환기 결과로 먼저 개발할 수 있어요.

- 만드는 코드: `plugin/lib/layer-data.js` (`buildDocument`, `buildTextLayer`, `summarizeBackground`)
- 실제 예시: `samples/sample-poster.layers.json`
- 바꿀 때는 `schemaVersion`을 올리고 이 문서와 B·C에게 같이 알려 주세요.

### 바뀐 점

| 버전 | 바뀐 것 |
| --- | --- |
| 0.5 | `styleRuns` 추가: 글자 구간이 여러 개일 때 구간마다 `{ text, color, sizePx, fontName, bold, italic, underline }` — 색만 다른 강조(색 의존 정보) 검사용 |
| 0.4 | `font.fauxItalic`(기울임), `font.caps`(`"all"` 전부 대문자 · `"small"` 작은 대문자 · `null`) 추가 — 글꼴 가독성 검사용 |
| 0.3 | 레이어 `spacing`(줄 수·줄 간격·자간), `origin`(글자 기준점) 추가. 기존 필드는 그대로예요 |
| 0.2 | CMYK 지원: `document.colorMode`, 레이어 `colorSource` 추가 · 목적 정보: `purposes`, 레이어 `groupIds`·`purposeSource`, 그룹 `purpose` 추가. **기존 필드는 그대로라 0.1 코드도 그대로 동작해요** |
| 0.1 | 처음 버전 |

## 문서 전체

```json
{
  "schemaVersion": "0.5",
  "source": "photoshop",
  "extractedAt": "2026-11-14T12:00:00.000Z",
  "document": {
    "key": "C:/작업/봄의제전.psd",
    "name": "봄의제전.psd",
    "path": "C:/작업/봄의제전.psd",
    "widthPx": 1754, "heightPx": 2480, "ppi": 150, "colorMode": "CMYK",
    "widthMm": 297, "heightMm": 419.9,
    "purpose": "mixed"
  },
  "purposes": { "version": 1, "document": "mixed", "groups": { "7": "info", "3": "art" }, "layers": { "5": "info" }, "updatedAt": "..." },
  "groups": [ { "id": 7, "name": "공연 정보", "groupPath": [], "groupIds": [], "visible": true, "purpose": "info" } ],
  "layers": [ /* 텍스트 레이어, 아래 참고 */ ],
  "warnings": []
}
```

| 필드 | 설명 |
| --- | --- |
| `source` | `"photoshop"`(플러그인) 또는 `"psd-file"`(PSD 변환기) |
| `document.key` | 목적 정보를 저장할 때 쓰는 문서 키. 플러그인은 **파일 경로**를 써요. 포토샵의 문서 ID는 다시 열면 바뀌기 때문이에요. 저장 안 된 문서는 `unsaved:이름` |
| `document.ppi` | 해상도. 인쇄 크기(mm, pt) 계산의 기준 |
| `document.colorMode` | `"RGB"`, `"CMYK"` 등. CMYK면 색은 모두 **RGB로 근사 변환한 값**이에요 (아래 참고) |
| `document.purpose` | 문서 전체 목적 `"art"`(예술적 표현) · `"info"`(정보 전달) · `"mixed"`(복합) · `null`(아직 안 정함). PSD에 저장된 값을 읽어요 |
| `purposes` | PSD에 저장된 목적 정보 원본. 형식은 아래 '목적 정보' 참고 |
| `groups` | 그룹(폴더) 목록. `purpose`는 그 그룹에 직접 지정한 목적 (`"art"`·`"info"`·`null`) |
| `warnings` | 문서 단위 경고 (합성 이미지 없음, RGB 아님 등) |

## 텍스트 레이어

```json
{
  "id": 6,
  "key": "sample-poster.psd#6",
  "name": "일시",
  "groupPath": ["공연 정보"],
  "groupIds": [7],
  "text": "11.8(토) 19:30",
  "sizePt": 13.9,
  "sizePx": 29,
  "sizeMm": 4.91,
  "sizeDetail": { "sourcePx": 29, "transformScale": 1, "note": "..." },
  "font": { "name": "MalgunGothic", "postScriptName": "MalgunGothic", "style": null, "fauxBold": false, "fauxItalic": false, "caps": null, "weightGuess": "regular" },
  "color": "#8A8478",
  "colorSource": { "space": "cmyk", "cmyk": { "c": 14, "m": 16, "y": 25, "k": 46 } },
  "colorRuns": ["#8A8478"],
  "spacing": { "lineCount": 1, "lineHeightRatio": 1.2, "autoLeading": true, "letterSpacingEm": 0 },
  "origin": { "x": 150, "y": 1520 },
  "opacity": 1,
  "opacityDetail": { "layer": 1, "fill": 1 },
  "blendMode": "normal",
  "visible": true,
  "bounds": { "left": 153, "top": 1497, "right": 331, "bottom": 1524, "width": 178, "height": 27 },
  "boundsMm": { "left": 25.9, "top": 253.5, "width": 30.1, "height": 4.6 },
  "background": {
    "method": "psd-composite-minus-text-mask",
    "sampleCount": 2373,
    "excludedTextPixels": 2433,
    "samples": ["#F4EEE2", "..."],
    "stats": {
      "meanColor": "#F4EEE2", "darkestColor": "#F4EEE2", "lightestColor": "#F4EEE2",
      "luminanceMin": 0.8587, "luminanceMax": 0.8587, "luminanceMean": 0.8587, "luminanceStdDev": 0
    }
  },
  "purpose": "info",
  "purposeSource": "group",
  "purposeSuggested": null,
  "warnings": []
}
```

| 필드 | 설명 | B가 쓰는 곳 |
| --- | --- | --- |
| `id` | 포토샵 레이어 ID. 파일 안에서는 바뀌지 않아요 | 결과 → 레이어 선택 |
| `key` | `문서키#레이어ID`. 목적 정보 저장 키 | 목적 저장 |
| `groupPath` / `groupIds` | 위 그룹부터 차례대로 이름 / ID. 맨 위 레벨이면 `[]` | 복합 목적 |
| `sizePt` | **실제로 보이는 크기**(변형 반영) = 글꼴 크기 × 변형 비율 × 72 / ppi | 2 글자 크기 |
| `sizeMm` | 글꼴 크기를 mm로 바꾼 값 (em 높이. 실제 글자 높이는 이보다 작아요) | 2 |
| `bounds` | 실제 잉크가 있는 영역, 문서 픽셀 좌표 (여러 줄이면 전체 묶음) | 4 위계, 위치 |
| `font.weightGuess` | 글꼴 이름으로 추정한 굵기 `light/regular/medium/bold`. 추정값이에요 | 2 |
| `spacing` | `lineCount` 줄바꿈 기준 줄 수 · `lineHeightRatio` 줄 간격(글자 크기의 배수, 자동 줄 간격이면 포토샵 기본 1.2) · `letterSpacingEm` 자간(em, 포토샵 자간 ÷ 1000). 글상자 안에서 자동으로 넘어간 줄은 세지 않아요 | ④ 텍스트 간격 |
| `origin` | 글자 기준점(베이스라인 왼쪽, 문서 px). 글자 크기를 바꾸면 이 점을 중심으로 커져요 | ③ 확대 후 잘림·겹침 |
| `color` | 가장 긴 글자 구간의 색 (항상 RGB hex). 여러 색이면 `colorRuns`에 모두 | 3 대비 |
| `styleRuns` | 글자 안에 색·크기·굵기가 다른 구간이 있을 때 구간 목록. 한 가지 스타일이면 `[]` | 색 의존 정보 |
| `colorSource` | 원래 색 공간. CMYK면 디자이너가 보는 **CMYK % 값**도 같이 줘요 (`{ space: "rgb" }` 또는 `{ space: "cmyk", cmyk: {c,m,y,k} }`) | 5 수정 제안 표시 |
| `opacity` | 레이어 불투명도 × 칠 불투명도 (0~1). 1보다 작으면 실제 색은 배경과 섞여요 | 3 |
| `blendMode` | `normal`이 아니면 실제 보이는 색이 `color`와 달라요 | 3 (경고) |
| `background` | 글자 영역의 배경 픽셀 요약. 아래 참고 | 3 대비 |
| `purpose` | 이 레이어에 **실제로 적용되는 목적** `"art"`·`"info"`·`null`. 문서가 복합이면 레이어 지정 → 가장 가까운 그룹 순서로 정해요 | 1 판정 강도 |
| `purposeSource` | 목적이 어디서 왔는지 `"document"`·`"group"`·`"layer"`·`null` | 결과 설명 |
| `purposeSuggested` | A는 `null`로 넘겨요. B가 추천값을 채워요 | 1 |
| `warnings` | 이 레이어를 믿기 어려운 이유 (효과, 색 공간, 크기 못 읽음 등) | 결과에 표시 |

## 배경 픽셀 (`background`)

`samples`는 배경 픽셀을 고르게 골라 최대 1024개까지 담아요. **"최저 대비"는 `samples`의 모든 색과 글자색의 대비를 구해서 가장 낮은 값**을 쓰면 돼요. `stats.darkestColor`나 `lightestColor`만으로도 대부분 충분해요(글자색과 휘도가 가장 가까운 쪽).

| `method` | 어디서 | 어떻게 |
| --- | --- | --- |
| `photoshop-hide-text-layer` | 플러그인 | 글자 레이어를 잠시 숨기고 그 영역 합성 픽셀을 읽어요. **글자 밑에 가려진 픽셀까지** 포함해요 |
| `psd-composite-minus-text-mask` | PSD 변환기 | 저장된 합성 이미지에서 글자 픽셀과 그 주변 1px을 빼고 읽어요. 글자 사이로 보이는 배경만 써요 |

- `luminanceStdDev`(휘도 편차)가 크면 복잡한 이미지 위 글자예요. 샘플 포스터에서 단색 배경은 0, 그림 위 글자는 0.05 이상이에요.
- 배경 복잡도의 다른 지표(윤곽선 밀도 등)가 필요하면 `samples`로 계산하거나 A에게 요청해 주세요.

## CMYK 문서

인쇄용 포스터는 CMYK로 만드는 경우가 많아요. 대비 계산은 화면 색(RGB) 기준이라서 이렇게 처리해요.

- 글자색과 배경 픽셀을 **포토샵 기본 CMYK 프로필(U.S. Web Coated SWOP v2)을 근사한 식**으로 RGB로 바꿔요. 글자와 배경이 같은 식으로 바뀌어서 서로 비교할 수 있어요.
- 문서에 다른 CMYK 프로필이 들어 있으면 실제 색과 조금 다를 수 있어요 → `warnings`에 적어요.
- 수정 제안의 색은 RGB hex로 주면 돼요. A가 CMYK 문서에는 **CMYK %로 바꿔서** 넣어요 (`docs/apply-fixes.md`).

## 목적 정보

디자이너가 고른 목적은 **PSD 파일 안(XMP 메타데이터)**에 저장돼요. 파일을 다른 사람에게 보내도 같이 가요.

```json
{ "version": 1, "document": "mixed", "groups": { "3": "art", "7": "info" }, "layers": { "5": "info" }, "updatedAt": "2026-11-15T10:00:00.000Z" }
```

| 문서 목적 | 레이어의 `purpose` |
| --- | --- |
| `art` 또는 `info` | 모든 레이어가 그 목적 (`purposeSource: "document"`) |
| `mixed` | ① 레이어 직접 지정 → ② 가장 가까운 그룹 지정 → ③ 없으면 `null` |
| `null` | 모두 `null` (아직 안 정함) |

- 코드: `plugin/lib/purpose-store.js` (읽기 `readFromPsd`, 저장 `writeToPsd`, 계산 `resolve`)
- 명령줄: `npm run purpose -- 포스터.psd --doc mixed --group 3=art --layer 5=info -o 결과.psd`
- 브라우저: 표 위의 '목적'에서 고르고 "목적 저장된 PSD 내려받기"

## 아직 안 되는 것 (알려진 한계)

- Lab 문서의 글자색 → 경고만 표시하고 `color: null`
- 플러그인에서 목적 정보를 포토샵 문서에 직접 저장 → 아직 PSD 파일 방식만 돼요 (확인 필요 목록에 있어요)
- 레이어 효과(외곽선, 그림자) → 경고만. 외곽선이 있으면 실제 대비는 더 좋을 수 있어요
- 래스터화된 글자(이미지로 바뀐 글자) → 텍스트 레이어가 아니라서 안 잡혀요 (OCR 필요)
- 플러그인의 `sizePt` 단위 → **11/19 가능성 확인에서 캐릭터 패널 값과 비교해 확정 예정**
