# 포토샵 연동 가능성 확인 (목표 11/19)

플러그인 코드(`plugin/`)는 포토샵 없이 작성해서 **아직 실제 포토샵에서 실행해 보지 않았어요.** 아래 순서대로 확인하고, 결과를 표에 적어 팀에 공유하세요.

## 준비

1. Creative Cloud에서 **Photoshop (v24.2 이상, 2023 이후 버전)** 설치
2. Creative Cloud에서 **UXP Developer Tool** 설치
3. 포토샵 실행 → 환경 설정 → 플러그인 → **개발자 모드 사용** 켜기 → 포토샵 재시작
4. UXP Developer Tool → **Add Plugin** → `poster-a11y/plugin/manifest.json` 선택 → **Load**
5. 포토샵 메뉴 플러그인 → **포스터 접근성 검수** 패널 열기
6. `samples/sample-poster.psd` 열기 → 패널에서 **문서 읽기**

> 오류가 나면 UXP Developer Tool에서 플러그인의 **Debug** 버튼을 눌러 콘솔 오류를 확인하세요. 코드를 고친 뒤에는 **Reload**를 누르면 돼요.

## 확인 항목

| # | 확인할 것 | 어떻게 | 결과 |
| --- | --- | --- | --- |
| 1 | 문서 해상도·크기 | 패널 '문서 정보'가 `1754×2480px · 150ppi`인지 | |
| 2 | 텍스트 레이어 찾기 | 8개, 그룹 2개('타이틀', '공연 정보')가 나오는지 | |
| 3 | **글자 크기 단위** | '접근성 안내' 레이어를 선택하고 문자(캐릭터) 패널의 크기와 패널의 `sizePt`가 같은지. 다르면 패널에 표시된 `size`, `implied` 원래 값을 적어 두세요 | |
| 4 | 변형된 글자 크기 | '접근성 안내'는 1.5배 늘린 글자예요. 실제 크기 14.4pt로 나오는지 | |
| 5 | 글자 색 | '일시'가 `#8A8478`인지 | |
| 6 | **배경 픽셀** | 공연 정보 글자들의 배경이 `#F4EEE2`인지, 그림 위 글자는 범위가 넓게 나오는지 | |
| 7 | 읽기 속도 | 레이어당 몇 ms인지 (패널에 표시). 레이어 50개짜리 포스터면 몇 초일지 계산 | |
| 8 | **작업 내역이 깨끗한지** | 작업 내역(History) 패널에 새 항목이 없고, 모든 글자가 다시 보이는지 | |
| 9 | 레이어 선택 | 패널의 레이어 항목을 누르면 포토샵에서 그 레이어가 선택되는지 | |
| 10 | JSON 저장 | 'JSON 저장' → 파일을 `npm run extract`로 만든 `samples/sample-poster.layers.json`과 비교. 같은 값이 나와야 해요 (배경 방식 `method`만 달라요) | |
| 11 | 저장 키 | 파일을 닫았다 다시 열어도 `document.key`(경로)와 레이어 `id`가 그대로인지 | |
| 12 | CMYK 문서 글자색 | `samples/sample-poster-cmyk.psd`를 열고 '일시'가 `#8A8478` 근처(±2)로 나오는지. 안 나오면 Debug 콘솔에서 `textStyle.color` 필드 이름(`cyan`, `magenta`, `yellowColor`, `black`)을 확인 | |
| 13 | 목적 정보 남는지 | `npm run purpose`로 목적을 넣은 PSD를 포토샵에서 열고 **다른 이름으로 저장** → `npm run purpose -- 저장한파일.psd`로 목적이 그대로 나오는지 (포토샵이 XMP를 지우지 않는지) | |
| 14 | 강조 수정(굵게·밑줄) | 색·시야 샘플에서 자동 수정한 PSD를 열고, '일시' 레이어의 '매진'만 가짜 굵게·밑줄이 켜졌는지 (다른 구간은 그대로) | |
| 15 | 핵심 정보 띠 여러 줄 | 같은 PSD의 '핵심 정보 띠 (접근성)' 레이어가 세 줄로 보이는지, 줄 간격·글꼴이 맞는지 (줄마다 문단을 나눠 넣었어요) | |

## 글꼴 바꾸기 (KoddiUD 온고딕)

| 확인할 것 | 결과 |
| --- | --- |
| 온고딕을 설치(폰코 활성화 등)한 포토샵에서 `글꼴 바꾸기`를 적용한 PSD를 열면, 글꼴 목록에 KoddiUD 온고딕 Regular·Bold·ExtraBold로 보이는지 (`engine/policies.js`의 `fontReplace.postScriptNames`: `KoddiUDOnGothic-Regular`/`-Bold`/`-ExtraBold`가 맞는지) | 글꼴 파일 name 표로 **이름은 확인됨** (11/25: PostScript 이름 3개 일치, 굵기 400·700·800). 포토샵에서 열어 보는 확인은 남음 |
| 브라우저가 설치된 온고딕을 `fontReplace.cssFamilies` 이름으로 찾는지 (웹: 글꼴 수정이 나오는지). 글꼴 파일의 옛 가족 이름이 굵기마다 달라서(`KoddiUD OnGothic Bold` 등) 묶음 이름과 굵기별 이름을 모두 넣었어요 | 확인 필요 (Windows·Mac 크롬에서 각각) |
| **Adobe Fonts판**(제작사 KCISA)의 PostScript 이름도 `KoddiUDOnGothic-Regular` 등과 같은지 — 다르면 포토샵이 Adobe Fonts로 자동으로 켜 주지 못해요. Adobe Fonts로 켠 뒤 포토샵 글꼴 목록·적용한 PSD로 확인 | 확인 필요 |
| 온고딕이 없는 컴퓨터(Creative Cloud 로그인)에서 적용한 PSD를 열면 '누락된 글꼴' 창이나 자동 켜기로 온고딕이 켜지는지 | 확인 필요 |
| '내 컴퓨터 기본 고딕'의 PostScript 이름이 맞는지: Windows `MalgunGothic`·`MalgunGothicBold`, Mac `AppleSDGothicNeo-Regular`·`-Bold`·`-ExtraBold` (`fontReplace.systemFallbacks`) | 확인 필요 |
| `caps` 수정(`fontCaps` 0)을 적용한 PSD를 포토샵에서 열면 '모두 대문자'가 꺼지고 입력한 대소문자로 보이는지 | 확인 필요 |
| 글꼴을 바꾼 뒤 글자 폭이 달라져 상자를 넘치는지 (미리보기 경고와 포토샵 결과 비교) | 확인 필요 |

## 주의: 샘플 PSD로 확인할 때

`samples/sample-poster.psd`는 포토샵이 아닌 코드로 만든 파일이에요. 포토샵에서 열 때 **"텍스트 레이어를 업데이트할까요?"** 같은 창이 뜨면 업데이트를 누르세요. 글자가 포토샵 글꼴(맑은 고딕)로 다시 그려지면서 위치가 몇 px 달라질 수 있어요.

**실제 디자이너가 만든 PSD(기획 C)로도 꼭 한 번 더 확인하세요.**

## 막히면 대안

| 문제 | 대안 |
| --- | --- |
| 3번 크기 단위가 다름 | `main.js`의 `effectivePt` 계산에 `× 72 / ppi` 보정을 넣거나 빼기 |
| 6번 `imaging.getPixels`가 안 됨 (버전 문제) | 포토샵 버전 확인 (Imaging API는 24.2부터). 안 되면 PSD 파일을 저장해 PSD 변환기 방식으로 읽기 |
| 6번 숨김 후 합성이 바로 안 바뀜 | 숨긴 뒤 `await` 한 번 더, 또는 레이어 픽셀로 마스크를 만들어 PSD 변환기 방식(`compositeHasText: true`)으로 바꾸기 |
| 8번 기록이 남음 | `suspendHistory` 대신 숨김 전후로 `historyStates` 확인, 또는 마스크 방식으로 바꿔 숨김 자체를 없애기 |
