# 레이어 데이터 형식 (A → B 약속) · v0.1

포토샵 연동(기술 A)이 검사 엔진(기술 B)에 넘기는 데이터예요.
**포토샵 플러그인**과 **PSD 변환기**가 똑같은 형식을 내보내요. 그래서 B와 C는 포토샵이 없어도 PSD 변환기 결과로 먼저 개발할 수 있어요.

- 만드는 코드: `plugin/lib/layer-data.js` (`buildDocument`, `buildTextLayer`, `summarizeBackground`)
- 실제 예시: `samples/sample-poster.layers.json`
- 바꿀 때는 `schemaVersion`을 올리고 이 문서와 B·C에게 같이 알려 주세요.

## 문서 전체

```json
{
  "schemaVersion": "0.1",
  "source": "photoshop",
  "extractedAt": "2026-11-14T12:00:00.000Z",
  "document": {
    "key": "C:/작업/봄의제전.psd",
    "name": "봄의제전.psd",
    "path": "C:/작업/봄의제전.psd",
    "widthPx": 1754, "heightPx": 2480, "ppi": 150,
    "widthMm": 297, "heightMm": 419.9,
    "purpose": null
  },
  "groups": [ { "id": 3, "name": "공연 정보", "groupPath": [], "visible": true } ],
  "layers": [ /* 텍스트 레이어, 아래 참고 */ ],
  "warnings": []
}
```

| 필드 | 설명 |
| --- | --- |
| `source` | `"photoshop"`(플러그인) 또는 `"psd-file"`(PSD 변환기) |
| `document.key` | 목적 정보를 저장할 때 쓰는 문서 키. 플러그인은 **파일 경로**를 써요. 포토샵의 문서 ID는 다시 열면 바뀌기 때문이에요. 저장 안 된 문서는 `unsaved:이름` |
| `document.ppi` | 해상도. 인쇄 크기(mm, pt) 계산의 기준 |
| `document.purpose` | 문서 전체 목적. A가 읽을 때는 `null`, 패널(C)에서 정해요 |
| `groups` | 그룹(폴더) 목록. 복합 목적에서 그룹마다 목적을 고를 때 써요 |
| `warnings` | 문서 단위 경고 (합성 이미지 없음, RGB 아님 등) |

## 텍스트 레이어

```json
{
  "id": 6,
  "key": "sample-poster.psd#6",
  "name": "일시",
  "groupPath": ["공연 정보"],
  "text": "11.8(토) 19:30",
  "sizePt": 13.9,
  "sizePx": 29,
  "sizeMm": 4.91,
  "sizeDetail": { "sourcePx": 29, "transformScale": 1, "note": "..." },
  "font": { "name": "MalgunGothic", "postScriptName": "MalgunGothic", "style": null, "fauxBold": false, "weightGuess": "regular" },
  "color": "#8A8478",
  "colorRuns": ["#8A8478"],
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
  "purpose": null,
  "purposeSuggested": null,
  "warnings": []
}
```

| 필드 | 설명 | B가 쓰는 곳 |
| --- | --- | --- |
| `id` | 포토샵 레이어 ID. 파일 안에서는 바뀌지 않아요 | 결과 → 레이어 선택 |
| `key` | `문서키#레이어ID`. 목적 정보 저장 키 | 목적 저장 |
| `groupPath` | 위 그룹부터 차례대로. 맨 위 레벨이면 `[]` | 복합 목적 |
| `sizePt` | **실제로 보이는 크기**(변형 반영) = 글꼴 크기 × 변형 비율 × 72 / ppi | 2 글자 크기 |
| `sizeMm` | 글꼴 크기를 mm로 바꾼 값 (em 높이. 실제 글자 높이는 이보다 작아요) | 2 |
| `bounds` | 실제 잉크가 있는 영역, 문서 픽셀 좌표 (여러 줄이면 전체 묶음) | 4 위계, 위치 |
| `font.weightGuess` | 글꼴 이름으로 추정한 굵기 `light/regular/medium/bold`. 추정값이에요 | 2 |
| `color` | 가장 긴 글자 구간의 색. 여러 색이면 `colorRuns`에 모두 | 3 대비 |
| `opacity` | 레이어 불투명도 × 칠 불투명도 (0~1). 1보다 작으면 실제 색은 배경과 섞여요 | 3 |
| `blendMode` | `normal`이 아니면 실제 보이는 색이 `color`와 달라요 | 3 (경고) |
| `background` | 글자 영역의 배경 픽셀 요약. 아래 참고 | 3 대비 |
| `purpose` / `purposeSuggested` | A는 `null`로 넘겨요. B가 추천값을, C가 디자이너 선택값을 채워요 | 1 |
| `warnings` | 이 레이어를 믿기 어려운 이유 (효과, 색 공간, 크기 못 읽음 등) | 결과에 표시 |

## 배경 픽셀 (`background`)

`samples`는 배경 픽셀을 고르게 골라 최대 1024개까지 담아요. **"최저 대비"는 `samples`의 모든 색과 글자색의 대비를 구해서 가장 낮은 값**을 쓰면 돼요. `stats.darkestColor`나 `lightestColor`만으로도 대부분 충분해요(글자색과 휘도가 가장 가까운 쪽).

| `method` | 어디서 | 어떻게 |
| --- | --- | --- |
| `photoshop-hide-text-layer` | 플러그인 | 글자 레이어를 잠시 숨기고 그 영역 합성 픽셀을 읽어요. **글자 밑에 가려진 픽셀까지** 포함해요 |
| `psd-composite-minus-text-mask` | PSD 변환기 | 저장된 합성 이미지에서 글자 픽셀과 그 주변 1px을 빼고 읽어요. 글자 사이로 보이는 배경만 써요 |

- `luminanceStdDev`(휘도 편차)가 크면 복잡한 이미지 위 글자예요. 샘플 포스터에서 단색 배경은 0, 그림 위 글자는 0.05 이상이에요.
- 배경 복잡도의 다른 지표(윤곽선 밀도 등)가 필요하면 `samples`로 계산하거나 A에게 요청해 주세요.

## 아직 안 되는 것 (알려진 한계)

- CMYK·Lab 문서의 색 → 경고만 표시하고 `color: null`
- 레이어 효과(외곽선, 그림자) → 경고만. 외곽선이 있으면 실제 대비는 더 좋을 수 있어요
- 래스터화된 글자(이미지로 바뀐 글자) → 텍스트 레이어가 아니라서 안 잡혀요 (OCR 필요)
- 플러그인의 `sizePt` 단위 → **11/19 가능성 확인에서 캐릭터 패널 값과 비교해 확정 예정**
