# 포스터 접근성 검수 — 포토샵 연동 (기술 A)

포토샵 문서에서 텍스트 레이어와 배경 픽셀을 읽어 검사 엔진(B)과 패널 화면(C)에 넘기는 부분이에요.

## 폴더 구조

```
plugin/                포토샵 플러그인 (UXP)
  manifest.json        플러그인 정보 (Photoshop 24.2 이상)
  index.html, main.js  패널 화면과 문서 읽기 코드
  lib/layer-data.js    ★ 공통 데이터 형식 — 플러그인·PSD 변환기·브라우저가 같이 씀
src/psd-extract.js     PSD 파일 → 공통 데이터 (포토샵 없이)
tools/
  psd-to-json.js       PSD → JSON 변환 (명령줄)
  make-sample-psd.js   테스트용 샘플 포스터 PSD 만들기
  serve.js             브라우저 변환 페이지 띄우기
web/index.html         브라우저 변환 페이지 (B·C용: PSD를 끌어다 놓으면 JSON)
samples/               샘플 PSD, 변환 결과 JSON, 정답 값
docs/
  layer-data.md        ★ A → B 데이터 형식 약속
  feasibility-checklist.md  11/19 포토샵 가능성 확인 순서
test/                  변환 결과 자동 확인
```

## 처음 한 번

```bash
npm install
```

## 자주 쓰는 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run extract -- 포스터.psd` | PSD → `포스터.layers.json` |
| `npm test` | 샘플 PSD 변환 결과가 정답과 맞는지 확인 |
| `npm run web` | 브라우저 변환 페이지 → http://localhost:5173/web/ |
| `npm run sample` | 샘플 PSD 다시 만들기 (Windows 맑은 고딕 필요) |

## 팀원에게

- **B (검사 엔진):** 데이터 형식은 `docs/layer-data.md`, 실제 예시는 `samples/sample-poster.layers.json`이에요. 실제 PSD는 `npm run extract` 또는 브라우저 페이지로 바로 JSON을 만들 수 있어요.
- **C (패널 화면):** 같은 JSON으로 화면 시안을 만들면, 2주차에 포토샵 패널로 옮길 때 데이터가 그대로 들어와요.
- **기획 C:** 실제 포스터 PSD를 `samples/`에 넣어 주세요. 저장할 때 **호환성 최대화**를 켜야 배경 픽셀을 읽을 수 있어요.

## 1주차 진행 상황

- [x] 공통 데이터 형식과 문서 (`docs/layer-data.md`)
- [x] PSD → JSON 변환기와 샘플 데이터 (테스트 14개 통과)
- [x] 브라우저 변환 페이지
- [x] 포토샵 플러그인 뼈대: 문서·텍스트 레이어·배경 픽셀 읽기, JSON 저장, 레이어 선택
- [ ] **포토샵에서 실제 실행 확인** (`docs/feasibility-checklist.md`) — 포토샵 설치 필요
- [ ] 기획 C의 실제 PSD로 확인
