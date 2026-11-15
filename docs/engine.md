# 검사 엔진 (기술 B 기준 구현) · v0.1

공통 레이어 데이터(`docs/layer-data.md`)를 받아 **목적에 따라 다르게 판정하고, 다르게 고치는 방법**을 돌려줘요.
포토샵 없이 동작하는 순수 JS예요. B 담당자가 이어받아 기준과 문구를 다듬는 것을 전제로 만든 **기준 구현**이에요.

```js
const result = Engine.checkDocument(layerData, { medium: "wall", distanceM: 2, lighting: "normal" });
const fixes = Engine.toApplyFixes(result);       // → A의 applyFixes(psd, fixes) 에 그대로
```

| 파일 | 하는 일 |
| --- | --- |
| `engine/policies.js` | ★ **목적별 정책 표** — 기준값·문구. 기획 A가 확정할 곳 (지금은 임시값) |
| `engine/engine.js` | 검사 본체: 크기·대비·위계, 목적 추천, 수정 전략, 충돌 감지 |
| `engine/color.js` | 대비 계산, OKLCH로 '같은 색상·밝기만 조절' 추천색 찾기 |
| `engine/roles.js` | 역할 분류(제목·일시·장소·가격·접근성), 대체텍스트 초안 |
| `test/engine.test.js` | 샘플 포스터로 확인하는 테스트 15개 |

## 목적별 정책 (팀 정책 표 → 코드)

| 목적 | 판정 | 수정 제안 | 추가 지원 |
| --- | --- | --- | --- |
| **예술적 표현** `art` | 기준 미달이어도 **참고** | 밝기 변화 OKLCH 0.12 이내, 크기 수정 없음, 옅은 배경 띠(45%까지). '모두 적용' 없음 | 대체 정보(대체텍스트) 제안 |
| **정보 전달** `info` | 엄격 (**어두운 조명이면 7:1**) | 기준을 넘을 때까지: 밝기 조절 → 배경 띠(90%까지) → 크기 키우기 | 접근성 버전 만들기 추천 |
| **복합** `mixed` | 레이어마다 art / info | 예술 요소는 건드리지 않음. **그림 위 정보 글자에 배경 띠 금지** | 고쳐도 기준 미달이면 **충돌** + 대체 정보 |

레이어 목적은 ① 디자이너가 PSD에 저장한 값 → ② 문서 목적(복합이 아니면) → ③ 엔진 추천값 순서로 정해요.

## 검사 항목

### 글자 크기 (`size`)
관람 거리에서 **글자 높이가 눈에 보이는 각도**(분각 ′)로 판정해요. 거리와 상관없이 같은 기준을 쓸 수 있어서예요.
- 글자 높이 ≈ 글꼴 크기 × 0.8 (한글·대문자 근사)
- 통과 ≥ 15′, 주의 ≥ 10′, 실패 < 10′ (시력 1.0이 겨우 읽는 글자 ≈ 5′)
- 통과에 필요한 **추천 pt**와, **저시력(0.3)에서도 읽히는지**를 같이 알려줘요
- SNS는 휴대폰 화면(너비 65mm, 35cm 거리)에 보이는 크기로 계산해요

| 매체 | 기본 관람 거리 | 2m 벽 포스터 기준 통과 크기 |
| --- | --- | --- |
| 벽 포스터 | 2m | 약 31pt |
| 전단 | 40cm | 약 6.5pt |

### 대비 (`contrast`)
- WCAG 1.4.3: 일반 4.5:1, 큰 글자(18pt 이상, 굵으면 14pt 이상) 3:1
- **이미지 배경 포함:** 배경 픽셀 샘플 하나하나와 대비를 구해서, 가장 낮은 쪽(아주 드문 얼룩 2%는 제외)으로 판정
- 반투명 글자는 배경과 섞은 색으로 계산
- 배경 복잡도: 밝기 편차로 단순 / 약간 복잡 / 복잡한 그림 배경

### 핵심 정보 위계 (`hierarchy`)
- 제목·일시·장소가 없으면 **누락**
- 일시·장소가 전체 글자 중 작은 편(중간값 미만)이거나 저시력에서 읽기 어려우면 **주의**

## 결과 형식

```json
{
  "document": { "purpose": "mixed", "purposeSource": "suggested", "purposeSuggested": "mixed" },
  "environment": { "medium": "wall", "distanceM": 2, "lighting": "normal" },
  "summary": { "counts": { "conflict": 1, "fail": 6, "warn": 5, "advisory": 2, "pass": 5 },
               "applyAllAllowed": true, "accessibleVersionRecommended": true, "alternativeRecommended": true },
  "altTextDraft": "공연 포스터. 봄의 제전. 11월 8일 토요일 저녁 7시 30분, ...",
  "results": [
    { "layerId": 6, "text": "11.8(토) 19:30", "role": "date", "purpose": "info", "purposeSource": "suggested",
      "check": "contrast", "status": "fail", "statusLabel": "실패",
      "metric": "대비 3.2:1 · 기준 4.5:1 · 단순한 배경",
      "fix": { "type": "color", "value": "#6F6A5E", "strategy": "full", "passes": true, "contrastAfter": 4.67 } },
    { "layerId": 5, "check": "contrast", "status": "conflict", "statusLabel": "충돌",
      "fix": { "type": "color", "value": "#FFFEFD", "strategy": "minimal", "passes": false },
      "alternative": { "type": "altText", "draft": "공연 포스터. 봄의 제전. ..." } }
  ]
}
```

| `status` | 뜻 |
| --- | --- |
| `pass` 통과 | 기준을 넘어요 |
| `warn` 주의 | 조금 모자라요 |
| `fail` 실패 | 정보 글자가 기준에 못 미쳐요 |
| `advisory` 참고 | 예술 글자가 기준에 못 미쳐요 (디자이너 판단 존중) |
| `conflict` 충돌 | 복합 목적에서 그림을 가리지 않고는 고칠 수 없어요 → 대체 정보 |

`fix.passes: false`는 "가장 나은 수정이지만 기준에는 못 미친다"는 뜻이에요. `toApplyFixes`는 이런 수정과 예술 '참고' 수정을 기본으로 빼요 (`includeFailing`, `includeAdvisory` 옵션으로 넣을 수 있어요).

## B 담당자에게 넘길 일

- [ ] 기획 A와 `policies.js`의 기준값 확정 (특히 크기 15′/10′, 예술 밝기 변화 폭 0.12)
- [ ] 기획 B의 결과 문구로 `messages` 바꾸기 (예술 '참고' 문구는 디자이너 의도를 존중하는 말투로)
- [ ] 기획팀 정답 데이터로 정확도 측정 (역할 분류, 목적 추천)
- [ ] 배경 복잡도에 윤곽선 밀도 추가 (지금은 밝기 편차만)
- [ ] QR 크기·접근성 정보 누락 검사 (발표 이후)
