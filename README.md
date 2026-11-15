# 포스터 접근성 검수 — 포토샵 연동 (기술 A)

포토샵 문서에서 텍스트 레이어와 배경 픽셀을 읽어 검사 엔진(B)과 패널 화면(C)에 넘기는 부분이에요.

## 폴더 구조

```
plugin/                포토샵 플러그인 (UXP)
  manifest.json        플러그인 정보 (Photoshop 24.2 이상)
  index.html, main.js  패널 화면과 문서 읽기 코드
  lib/layer-data.js    ★ 공통 데이터 형식 — 플러그인·PSD 변환기·브라우저가 같이 씀 (CMYK 변환 포함)
  lib/purpose-store.js ★ 목적 정보(예술/정보/복합)를 PSD 안(XMP)에 저장·불러오기
src/psd-extract.js     PSD 파일 → 공통 데이터 (포토샵 없이)
src/psd-apply.js       수정 제안 적용 → 접근성 버전 PSD (포토샵 없이)
tools/
  psd-to-json.js       PSD → JSON 변환 (명령줄)
  apply-fixes.js       수정 목록 적용 → 접근성 버전 PSD + 미리보기 PNG
  set-purpose.js       목적 정보 저장·확인
  make-sample-psd.js   테스트용 샘플 포스터 PSD 만들기
  serve.js             브라우저 변환 페이지 띄우기
web/index.html         브라우저 변환 페이지 (B·C용: PSD를 끌어다 놓으면 JSON)
samples/               샘플 PSD (RGB, 인쇄용 CMYK), 변환 결과 JSON, 정답 값
docs/
  layer-data.md        ★ A → B 데이터 형식 약속
  apply-fixes.md       ★ B → A 수정 목록 형식 약속
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
| `npm run apply -- 포스터.psd 수정목록.json` | 수정 적용 → `포스터.접근성버전.psd` (원본은 그대로) |
| `npm run purpose -- 포스터.psd --doc mixed --group 3=art -o 결과.psd` | 목적 정보 저장 (인자 없이 쓰면 확인만) |
| `npm test` | 샘플 PSD 변환 결과가 정답과 맞는지 확인 |
| `npm run web` | 브라우저 변환 페이지 → http://localhost:5173/web/ |
| `npm run sample` | 샘플 PSD 다시 만들기 (Windows 맑은 고딕 필요) |

## 팀원에게

- **B (검사 엔진):** 데이터 형식은 `docs/layer-data.md`(v0.2), 실제 예시는 `samples/sample-poster.layers.json`이에요. 레이어마다 `purpose`(목적)가 들어 있어서 목적별로 판정 강도를 바꾸면 돼요. 실제 PSD는 `npm run extract` 또는 브라우저 페이지로 바로 JSON을 만들 수 있어요.
- **C (패널 화면):** 같은 JSON으로 화면 시안을 만들면, 2주차에 포토샵 패널로 옮길 때 데이터가 그대로 들어와요.
- **기획 C:** 실제 포스터 PSD를 `samples/`에 넣어 주세요. 저장할 때 **호환성 최대화**를 켜야 배경 픽셀을 읽을 수 있어요.

## 진행 상황

- [x] 공통 데이터 형식과 문서 (`docs/layer-data.md`)
- [x] PSD → JSON 변환기와 샘플 데이터
- [x] 브라우저 변환 페이지
- [x] **포토샵 없이** 수정 적용(글자색·크기·배경 띠)과 접근성 버전 PSD 만들기 — 브라우저·명령줄 
- [x] 인쇄용 **CMYK 포스터** 읽기·수정 (글자색을 CMYK %로 저장)
- [x] **목적 정보 저장·불러오기** (PSD 안 XMP, 복합 목적은 그룹·레이어별) — 원래 2주차 일 (테스트 44개 통과)
- [x] 포토샵 플러그인 뼈대: 문서·텍스트 레이어·배경 픽셀 읽기, JSON 저장, 레이어 선택
- [ ] **포토샵에서 실제 실행 확인** (`docs/feasibility-checklist.md`) — 포토샵 설치 필요
- [ ] 기획 C의 실제 PSD로 확인
