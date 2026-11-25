# 수정 적용 형식 (B → A 약속) · v0.2

검사 엔진(B)이 고른 수정 제안을 A에게 넘기면, A가 PSD에 적용해 **접근성 버전 PSD**를 만들어요.
포토샵 없이 PSD 파일을 직접 고치는 방식이에요. **원본 파일은 절대 덮어쓰지 않아요.**

- 적용 코드: `src/psd-apply.js` (`applyFixes`)
- 명령줄: `npm run apply -- 원본.psd 수정목록.json` → `원본.접근성버전.psd` + 미리보기 PNG
- 브라우저: `npm run web` → 레이어를 고르고 수정 추가 → "접근성 버전 PSD 내려받기"
- 예시: `samples/sample-fixes.json`

## 수정 목록

`{ "fixes": [ ... ] }` 또는 배열 그대로 넘겨요. 순서대로 적용하되, **배경 띠는 맨 마지막**에 넣어요.

| type | 필드 | 하는 일 | 미리보기 정확도 |
| --- | --- | --- | --- |
| `color` | `value`: `"#524D42"`, 선택 `runs`: `[{ "from": "#8A8478", "value": "#524D42" }]` | 글자색을 바꿔요. `runs`가 있으면 **그 색 구간만** 바꾸고 강조색 같은 나머지 색은 그대로 둬요. 없으면 글자 전체를 `value`로 | 정확 (색 구간은 픽셀마다 가장 가까운 원래 색으로 골라요) |
| `size` | `valuePt`: `11` | 실제로 보이는 크기를 이 pt로 맞춰요 (변형 비율 반영, 행간도 같이) | 근사치 (픽셀 확대) |
| `backplate` | `color`(기본 `#FFFFFF`), `opacity`(0~1, 기본 0.85), `paddingMm`(기본 1.5) | 글자 **바로 아래**에 사각형 레이어 `접근성 배경 띠 · 레이어이름`을 새로 만들어요 | 정확 |
| `weight` | `fauxBold: true` | 포토샵 **가짜 굵게(Faux Bold)**를 켜요. 더 굵은 글꼴로 바꾸는 건 디자이너가 해 주세요 | 근사치 (글자 모양을 조금 두껍게) |
| `emphasis` | `runs: [{ from: "#C62828", bold: true, underline: true, value?: "#7F1616" }, { from: "#2E7D32", bold: true }]` | 색만 다른 강조(WCAG 1.4.1): **각 색 구간만** 그 항목대로 가짜 굵게·밑줄 (+ `value`가 있으면 그 색으로). 강조가 여럿이면 항목마다 모양이 달라요. 다른 구간은 그대로 | 근사치 (색마다 그 색 픽셀만 조금 두껍게, 그 구간 아래에 밑줄) |
| `infoStrip` | `text`(줄은 `
`), `sizePt`, `left`·`top`(px), `color`, `plate`, `plateOpacity`, `paddingMm`, `fontName`, `sourceIds` | 좁은 시야: 흩어진 핵심 정보를 모은 **새 글자 레이어 `핵심 정보 띠 (접근성)`** + 흰 판 레이어를 맨 위에 넣어요. `layerId` 없음. 원래 글자는 그대로 | 미리보기 글자는 `opts.renderText`로 그려요 (없으면 빈 그림). 포토샵에서 여러 줄 표시는 확인 필요 |
| `caps` | `caps: "normal"` | 포토샵 '모두 대문자(All Caps)' 설정을 꺼요 (`fontCaps` 0). 글자 내용은 그대로라 입력한 대소문자로 보여요 | 근사치 (`opts.renderText`가 있고 글자색이 하나면 입력한 글자를 다시 그려요. 원래 글꼴이 브라우저에 없으면 비슷한 고딕) · 없으면 반영 안 됨 |
| `font` | `postScriptName`(예 `"KoddiUDOnGothic-Bold"`), 선택 `family`·`weight`(`regular`/`bold`/`extraBold`)·`cssFamilies`·`upright`·`installed`·`weightLabel` | 모든 글자 구간의 글꼴을 바꿔요. `upright: true`면 가짜 기울임도 꺼요. 포토샵에 그 글꼴이 있어야 제대로 보여요. 없으면 포토샵이 열 때 Adobe Fonts로 켤 수 있어요(확인 필요). `installed`: 브라우저가 글꼴을 찾았는지(미리보기용) | 근사치 (`opts.renderText`가 있고 글자색이 하나면 새 글꼴로 다시 그려요. 정렬·줄 간격은 대략. 폭이 달라져 넘치거나 겹치면 경고) · 없으면 반영 안 됨 |
| `spacing` | `lineHeight`(글자 크기의 배수, 예 1.5), `letterSpacingEm`(예 0) — 둘 중 하나만 넣어도 돼요 | 줄 간격(자동 줄 간격 끔)과 자간을 바꿔요 | **반영 안 됨** — 포토샵에서 열면 반영돼요 |

```json
{
  "fixes": [
    { "layerId": 6, "type": "color", "value": "#524D42" },
    { "layerId": 11, "type": "size", "valuePt": 11 },
    { "layerId": 5, "type": "backplate", "color": "#1B1A2E", "opacity": 0.85, "paddingMm": 2 }
  ]
}
```

`reason` 같은 다른 필드를 넣어도 괜찮아요(무시해요). 그래서 B의 검사 결과 `fix`에 `layerId`만 붙여서 넘겨도 돼요.

```js
// B 결과 → 수정 목록
const fixes = results.filter(r => r.fix && r.fix.passes !== false).map(r => ({ layerId: r.layerId, ...r.fix }));
// fix.type 이름을 color / size / backplate 로 맞춰 주세요. size 는 value 대신 valuePt.
```

## CMYK 문서

- 색은 RGB hex로 주면 돼요. A가 CMYK 문서에는 **CMYK %로 바꿔서** 글자색에 넣어요 (결과 메시지에 `CMYK 25/26/38/68`처럼 보여요).
- 인쇄로 낼 수 없는 색(예: 형광 초록)이면 가장 가까운 인쇄 색으로 바꾸고 메시지에 ⚠로 알려요.
- 배경 띠 색도 같은 방식으로 인쇄 가능한 색에 맞춰요.

## 목적 정보

수정을 적용해도 PSD 안의 목적 정보는 그대로 남아요. 접근성 버전 PSD를 다시 열어도 목적이 유지돼요.

## 결과

`applyFixes(psd, fixes)`가 돌려주는 값:

| 필드 | 설명 |
| --- | --- |
| `psd` | 수정된 PSD 객체 (원본은 그대로). `writePsd(psd, WRITE_OPTIONS)`로 저장 |
| `applied` | 적용한 수정과 설명. 배경 띠는 `createdLayerId` 포함 |
| `skipped` | 못 한 수정과 이유 (레이어 없음, 텍스트 레이어 아님, 형식 오류) |
| `warnings` | 미리보기가 부정확할 수 있는 이유 (혼합 모드, 레이어 효과, 조정 레이어, 클리핑), 그리고 **키운 글자가 포스터 밖으로 나가거나 다른 글자와 겹치는지** |
| `previewMatchesOriginal` | 원본을 다시 합성했을 때 저장된 이미지와 같았는지. `false`면 미리보기는 참고용 |

## 포토샵에서 열면

- 저장할 때 텍스트 레이어에 "다시 그리기" 표시를 해요 (`invalidateTextLayers`). 포토샵이 바뀐 색·크기로 **글자를 새로 그려요.**
- 그래서 크기를 바꾼 글자는 미리보기와 포토샵 결과가 몇 px 다를 수 있어요. 최종 확인은 포토샵에서 해 주세요.

## 아직 안 되는 것

- 진짜 굵은 글꼴로 바꾸기 (지금은 가짜 굵게만. 글꼴 파일이 필요해요)
- 위치 옮기기·줄바꿈 (재배치) — 엔진이 겹침을 알려 주면 디자이너가 직접 옮겨요
- 미리보기에서 줄 간격·자간 변경
- 미리보기에서 혼합 모드·레이어 효과·조정 레이어 반영
