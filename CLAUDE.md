# 프로젝트 규칙 — 포스터 접근성 검수 (포토샵 연동, 기술 A)

- `docs/기획서.md`를 기준으로 작업한다. 기획서에 없는 기능이나 '이번에 하지 않는 것'에 든 일은 만들기 전에 먼저 물어본다.
- 한 번에 기능 하나만 작업한다 (브랜치·PR 하나에 기능 하나).
- 기능을 끝내면 `progress.md`에 완료한 일과 남은 일을 적는다.
- 배포와 main 합치기는 사용자가 확인한 뒤에 한다.
- 이 저장소는 4인 팀 중 **기술 A(포토샵 연동)** 담당 코드에서 시작했고, `engine/`에 **검사 엔진(B)의 기준 구현**이 있다. 판정 기준값과 문구는 `engine/policies.js`에만 두고, 엔진 코드에 숫자를 직접 넣지 않는다.
- 출력 데이터 형식은 `docs/layer-data.md`가 기준이다. 형식을 바꾸면 `schemaVersion`을 올리고 문서와 테스트를 같이 고친다.
- 데이터를 만드는 코드는 `plugin/lib/layer-data.js` 한 곳에만 둔다. 플러그인·PSD 변환기·브라우저가 이 파일을 같이 쓴다 (UMD, 의존성 없음).
- 플러그인 코드는 UXP 환경(CommonJS `require`, `photoshop`·`uxp` 모듈)을 가정한다. 브라우저 전용 API를 쓰지 않는다.
- 문서를 바꾸는 작업은 `core.executeAsModal` 안에서 하고, 읽기용 변경(레이어 숨김 등)은 작업 내역에 남기지 않는다.
- 수정 적용은 `src/psd-apply.js`, 입력 형식은 `docs/apply-fixes.md`가 기준이다. 원본 PSD 파일과 원본 객체는 절대 바꾸지 않고 복사본을 만든다.
- 목적 정보는 `plugin/lib/purpose-store.js`로 PSD XMP에 저장한다. 레이어 목적 계산 규칙(문서 → 레이어 지정 → 가까운 그룹)은 `resolve` 한 곳에서만 정한다.
- CMYK 색 변환은 `layer-data.js`의 `cmykToRgb`/`rgbToCmyk`만 쓴다 (글자와 배경이 같은 기준이어야 대비가 맞다).
- 시뮬레이션은 미리보기용 근사치다. 합격·불합격 판정 로직은 넣지 않는다 (B의 일).
- 브라우저 페이지에 스크립트를 추가하면 `tools/build-web.js`의 FILES·REWRITES에도 넣는다.
- 목적 정보 저장 키는 문서 ID가 아니라 **파일 경로 + 레이어 ID**(`document.key`, `layer.key`)를 쓴다.
- 기능을 고치면 `npm test`를 돌린다. 샘플 PSD를 바꾸면 `npm run sample` 후 정답 파일도 함께 갱신된다.
- 포토샵에서 직접 확인하지 못한 동작은 "확인 필요"로 표시하고 `docs/feasibility-checklist.md`에 항목을 추가한다.
- 사용자에게 보이는 문구는 한국어, 해요체로 쓴다.
