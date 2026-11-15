# 수정 적용 형식 (B → A 약속) · v0.1

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
| `color` | `value`: `"#524D42"` | 글자색을 바꿔요 (여러 색 구간이 있어도 모두 같은 색으로) | 정확 |
| `size` | `valuePt`: `11` | 실제로 보이는 크기를 이 pt로 맞춰요 (변형 비율 반영, 행간도 같이) | 근사치 (픽셀 확대) |
| `backplate` | `color`(기본 `#FFFFFF`), `opacity`(0~1, 기본 0.85), `paddingMm`(기본 1.5) | 글자 **바로 아래**에 사각형 레이어 `접근성 배경 띠 · 레이어이름`을 새로 만들어요 | 정확 |

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

## 결과

`applyFixes(psd, fixes)`가 돌려주는 값:

| 필드 | 설명 |
| --- | --- |
| `psd` | 수정된 PSD 객체 (원본은 그대로). `writePsd(psd, WRITE_OPTIONS)`로 저장 |
| `applied` | 적용한 수정과 설명. 배경 띠는 `createdLayerId` 포함 |
| `skipped` | 못 한 수정과 이유 (레이어 없음, 텍스트 레이어 아님, 형식 오류) |
| `warnings` | 미리보기가 부정확할 수 있는 이유 (혼합 모드, 레이어 효과, 조정 레이어, 클리핑) |
| `previewMatchesOriginal` | 원본을 다시 합성했을 때 저장된 이미지와 같았는지. `false`면 미리보기는 참고용 |

## 포토샵에서 열면

- 저장할 때 텍스트 레이어에 "다시 그리기" 표시를 해요 (`invalidateTextLayers`). 포토샵이 바뀐 색·크기로 **글자를 새로 그려요.**
- 그래서 크기를 바꾼 글자는 미리보기와 포토샵 결과가 몇 px 다를 수 있어요. 최종 확인은 포토샵에서 해 주세요.

## 아직 안 되는 것

- 글자 굵기 바꾸기 (글꼴 파일을 바꿔야 해서 포토샵이 필요해요)
- 위치 옮기기·줄바꿈 (재배치)
- 미리보기에서 혼합 모드·레이어 효과·조정 레이어 반영
