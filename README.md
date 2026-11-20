# 클리어 뷰 (ClearView) — 포스터 접근성 검수

포스터 PSD의 글자를 읽고(기술 A), 목적에 따라 검사하고(기술 B 기준 구현), 고친 접근성 버전을 만드는 도구예요.

- 기획서(무엇을·왜·어디까지·하지 않는 것): [docs/기획서.md](docs/기획서.md)
- 진행 기록(완료한 일·남은 일): [progress.md](progress.md)

## 폴더 구조

```
plugin/                포토샵 플러그인 (UXP)
  manifest.json        플러그인 정보 (Photoshop 24.2 이상)
  index.html, main.js  패널 화면과 문서 읽기 코드
  lib/layer-data.js    ★ 공통 데이터 형식 — 플러그인·PSD 변환기·브라우저가 같이 씀 (CMYK 변환 포함)
  lib/purpose-store.js ★ 목적 정보(예술/정보/복합)를 PSD 안(XMP)에 저장·불러오기
src/psd-extract.js     PSD 파일 → 공통 데이터 (포토샵 없이)
src/psd-apply.js       수정 제안 적용 → 접근성 버전 PSD (포토샵 없이)
engine/                ★ 검사 엔진 (기술 B 기준 구현) — 정책 표 policies.js, 본체 engine.js (docs/engine.md)
src/simulate.js        보는 사람·환경 미리보기 (색각이상, 저시력 흐림, 대비 저하, 어두운 조명)
tools/
  psd-to-json.js       PSD → JSON 변환 (명령줄)
  apply-fixes.js       수정 목록 적용 → 접근성 버전 PSD + 미리보기 PNG
  set-purpose.js       목적 정보 저장·확인
  make-sample-psd.js   테스트용 샘플 포스터 PSD 만들기
  make-color-sample-psd.js  색각이상·좁은 시야 시연용 샘플 (A1 현수막)
  serve.js             브라우저 변환 페이지 띄우기
  build-web.js         브라우저 페이지를 배포용 폴더(dist-web/)로 묶기
web/index.html         ★ 클리어 뷰 (사용자 화면): 용도·보는 사람(저시력 단계) 고르기 → 올리기 → 번호를 누르면 설명과 고친 모습 → 접근성 버전·큰 글씨 안내문 받기
src/large-print.js     큰 글씨 안내문 (A4 고대비) 글·배치·PDF 만들기
web/dev.html           개발자 도구 (B·C용: 레이어 JSON, 검사 결과 원본, 수동 수정 목록)
samples/               샘플 PSD (RGB, 인쇄용 CMYK, 색·시야 문제 sample-color), 변환 결과 JSON, 정답 값
docs/
  layer-data.md        ★ A → B 데이터 형식 약속
  apply-fixes.md       ★ B → A 수정 목록 형식 약속
  engine.md            ★ 검사 엔진: 목적별 정책, 검사 항목, 결과 형식, B에게 넘길 일
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
| `npm run web` | 클리어 뷰 → http://localhost:5173/web/ (개발자 도구는 `/web/dev.html`) |
| `npm run build:web` | 배포용 폴더 `dist-web/` 만들기 → Vercel 등에 이 폴더만 올리면 돼요 |
| `npm run sample` | 샘플 PSD 다시 만들기 (Windows 맑은 고딕 필요) |
| `npm run sample:color` | 색·시야 문제 샘플 다시 만들기 (기존 샘플·정답은 그대로) |

## 웹 페이지 (배포됨)

**https://poster-a11y-chi.vercel.app** — 클리어 뷰. 설치 없이 링크만 열면 돼요. 개발자 도구는 `/dev.html`. PSD는 방문자의 브라우저 안에서만 처리되고 서버로 올라가지 않아요.

다시 배포하려면 (Vercel에 로그인한 사람만):

```bash
npm run build:web
cd dist-web
npx vercel deploy --prod --yes
```

처음 한 번은 `dist-web`에서 `npx vercel link --yes --project poster-a11y`로 연결해야 해요. 연결할 때 생기는 `.env.local`(로그인 토큰)은 배포 전에 지워 주세요.

## 팀원에게

- **모두:** 위 웹 페이지 주소로 바로 써 볼 수 있어요. '샘플 포스터' 버튼을 누르면 PSD 없이도 시작돼요.
- **B (검사 엔진):** `engine/`에 기준 구현이 있어요 (`docs/engine.md`). 이어받아 기준값과 문구를 다듬어 주세요.
- **B (데이터):** 데이터 형식은 `docs/layer-data.md`(v0.2), 실제 예시는 `samples/sample-poster.layers.json`이에요. 레이어마다 `purpose`(목적)가 들어 있어서 목적별로 판정 강도를 바꾸면 돼요. 실제 PSD는 `npm run extract` 또는 브라우저 페이지로 바로 JSON을 만들 수 있어요.
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
- [x] **보는 사람·환경 미리보기**: 색각이상 3종, 시력·관람 거리로 계산한 흐림, 대비 저하, 어두운 조명 — 원래 3주차 일
- [x] 브라우저 페이지 배포용 묶음 (`npm run build:web`), 샘플 포스터 버튼
- [x] **검사 엔진 기준 구현 (B)**: 목적별 판정, 크기(관람 거리 각도)·대비(이미지 배경)·위계, 목적 추천, OKLCH 추천색, 배경 띠, 충돌 감지와 대체텍스트, 검사 → 수정 적용 연결
- [ ] **포토샵에서 실제 실행 확인** (`docs/feasibility-checklist.md`) — 포토샵 설치 필요
- [ ] 기획 C의 실제 PSD로 확인
