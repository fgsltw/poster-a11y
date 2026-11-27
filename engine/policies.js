/*
 * policies.js — 목적별 정책 표 (검사 엔진의 설정 파일)
 *
 * ★ 기획 A가 확정할 값이에요. 지금 들어 있는 숫자는 WCAG 등 공개 기준으로 채운 '임시값'이에요.
 *   숫자와 문구만 바꾸면 엔진 코드를 고치지 않아도 판정이 바뀌어요.
 *
 * 목적
 *   art   예술적 표현 — 디자이너 의도를 지키고, 기준 미달은 '참고'로만 알려요
 *   info  정보 전달   — 기준을 엄격하게 적용하고, 통과할 때까지 고치는 방법을 제안해요
 *   mixed 복합 목적   — 레이어마다 art / info 정책을 따로 적용해요 (예술 요소는 건드리지 않음)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EnginePolicies = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  return {
    version: "0.1-임시",

    // ---------------------------------------------------------------- 보는 환경
    // 매체를 고르면 관람 거리 기본값이 정해져요. 패널에서 직접 바꿀 수도 있어요.
    // sizeBasis: 글자 크기(pt)를 무엇으로 잴지
    //   "print"  인쇄 크기 = 글자 픽셀 × 72 ÷ 문서 해상도(ppi). 종이에 뽑는 매체
    //   "screen" 휴대폰 화면에 보이는 크기. 이미지를 화면 너비에 맞춰 보여준다고 봐요.
    //            SNS 이미지의 ppi는 인쇄하지 않아서 의미가 없는 값이라 쓰지 않아요.
    //            screenWidthCssPx: 휴대폰 화면 너비(CSS px). 1pt = 4/3 CSS px (WCAG 큰 글자 18pt = 24 CSS px)
    environments: {
      wall: { label: "벽에 붙이는 포스터", distanceM: 2, sizeBasis: "print" },
      flyer: { label: "손에 드는 전단", distanceM: 0.4, sizeBasis: "print" },
      sns: { label: "SNS 이미지 (휴대폰)", distanceM: 0.35, screenWidthMm: 65, sizeBasis: "screen", screenWidthCssPx: 390 } // 390: 많이 쓰는 휴대폰 너비 (임시값, 기획 확인 필요)
    },
    lighting: {
      normal: { label: "보통 조명" },
      dim: { label: "어두운 조명", note: "정보 전달 글자는 대비 기준을 더 높여요" }
    },

    // ---------------------------------------------------------------- 누가 보나요 (보는 사람의 시력)
    // 시력은 '좋은 눈의 교정시력'(소수 시력) 기준이에요.
    //   · WHO ICD-11: 0.3(6/18)보다 나쁘면 중등도 시각손상, 0.1(6/60)보다 나쁘면 중증, 0.05(3/60)보다 나쁘면 실명
    //   · 한국 장애정도판정기준(보건복지부 고시): 좋은 눈 0.2 이하 = 시각장애(심하지 않은 장애), 0.06 이하 = 심한 장애
    // 각 단계는 그 구간의 '경계에 있는 사람'도 읽을 수 있게 맞춰요.
    viewers: {
      general: { label: "일반 시력", acuity: null, note: "시력 1.0 기준" },
      low: { label: "저시력 (시력 0.3)", acuity: 0.3, note: "WHO 중등도 시각손상이 시작되는 시력 (6/18)" },
      disability: { label: "시각장애 (시력 0.2)", acuity: 0.2, note: "한국 시각장애 판정 기준: 좋은 눈 0.2 이하 (심하지 않은 장애)" },
      severe: { label: "심한 시각장애 (시력 0.06)", acuity: 0.06, note: "한국 시각장애 판정 기준: 좋은 눈 0.06 이하 (심한 장애)" }
    },
    // 시야 (시야가 좁은 사람: 녹내장·망막색소변성 등). 장애정도 판정기준(보건복지부 고시 제2025-228호):
    //   두 눈의 시야가 각각 모든 방향에서 10도 이하 = 시각장애(심하지 않은 장애), 5도 이하 = 심한 장애
    //   '모든 방향에서 N도' → 한 번에 보이는 범위는 반지름 N도, 지름 2N도
    visualField: {
      levels: {
        normal: { label: "보통 시야", deg: null },
        narrow: { label: "좁은 시야 (10°)", deg: 10, note: "모든 방향 10도 이하 = 시각장애 (심하지 않은 장애)" },
        veryNarrow: { label: "아주 좁은 시야 (5°)", deg: 5, note: "모든 방향 5도 이하 = 심한 장애" }
      },
      // 한 번에 함께 보여야 하는 핵심 정보 (근접성의 원칙)
      roles: ["date", "place", "price", "access"],
      // 핵심 정보 띠: 흩어진 핵심 정보를 한 줄(최대 maxLines줄)로 모은 새 글자 레이어 — 임시값
      strip: {
        color: "#111111", plate: "#FFFFFF", plateOpacity: 0.95, paddingMm: 2,
        // 글자 폭 어림 (글자 크기 대비): 한글·한자, 그 밖의 글자
        wideChar: 0.95, narrowChar: 0.55,
        // 한 줄 폭은 한 번에 보이는 지름의 이 비율까지
        maxWidthOfView: 0.9,
        maxLines: 4,
        // 묶음 아래 띄우는 간격 (글자 크기 대비)
        gap: 0.6,
        separator: " · "
      }
    },

    // 저시력자에게 맞춘 기준 (보는 사람을 저시력 이상으로 고르면 적용)
    lowVisionReading: {
      // 겨우 보이는 크기(5′ ÷ 시력)의 몇 배여야 편하게 읽는지 (acuity reserve).
      // 저시력 읽기 연구에서 흔히 쓰는 고정값 0.3 log ≈ 2배. 짧은 정보(포스터)는 이 정도로 봐요.
      acuityReserve: 2,
      // 대비: WCAG 1.4.6(AAA) — 시력 약 0.25(20/80) 수준의 대비 감도 손실을 보완하는 값
      contrastNormal: 7,
      contrastLarge: 4.5,
      // 필요한 글자 높이가 포스터 높이의 이 비율보다 크면, 글자를 키우는 대신 큰 글씨 안내문을 권해요
      maxGlyphOfPosterHeight: 0.08
    },

    // ---------------------------------------------------------------- 글꼴 가독성 (저시력자는 글자 모양 전체로 단어를 알아봐요)
    fontLegibility: {
      // 영문 키워드는 글꼴 이름 속 단어의 시작과 비교해요 (OpenSans 의 "pen" 같은 오탐 방지), 한글 키워드는 포함 여부로
      decorative: ["script", "brush", "hand", "callig", "marker", "comic", "graffiti", "붓", "손글씨", "캘리", "필기", "궁서"],
      // 일본어·중국어 붓글씨·장식 글꼴: 이름 어디에 있어도 잡아요 (HGSGyoshotai·STXingkai·FZShuTi 처럼 앞에 회사 이름이 붙어서) (11/27)
      //   일본어: 行書(gyosho)·草書(sosho)·筆(fude)·手書き(tegaki)·ポップ体(poptai) / 중국어: 行楷(xingkai)·行书(xingshu)·草书(caoshu)·舒体(shuti)·彩云(caiyun)·琥珀(hupo)
      //   해서(楷体 KaiTi)·예서(隷書 Reisho, 隶书 LiSu)는 비교적 읽기 쉬워서 빼요. 'pop'처럼 짧은 말은 Poppins 같은 고딕도 잡아서 안 써요
      decorativeAnywhere: ["gyosho", "gyousho", "sosho", "sousho", "fude", "tegaki", "poptai", "xingkai", "xingshu", "caoshu", "shuti", "caiyun", "hupo",
        "行書", "行书", "草書", "草书", "毛筆", "毛笔", "筆", "手書", "手書き", "ポップ", "行楷", "舒体", "彩云", "彩雲", "琥珀"],
      condensed: ["condensed", "narrow", "compressed", "cond", "compact"],
      italic: ["italic", "oblique"],
      // '영문 전부 대문자'는 긴 문장만 '참고'로 알려요 (11/26).
      //   근거: 대문자는 긴 글을 읽는 속도를 늦추지만(Tinker), 짧은 글을 힐끗 볼 때는 오히려 낫고,
      //   같은 글자 크기에서 대문자가 커서 저시력자에게 더 읽기 쉽다는 연구도 있어요 (Arditi & Cho 2007, 저시력 4명).
      //   그래서 "SOLD OUT", "10AM_08PM" 같은 짧은 문구는 넘겨요. ('단어 모양' 설명은 옛 이론이라 쓰지 않아요)
      allCapsMinWords: 4, // 영문 단어가 이 수 이상이고 전부 대문자면 '긴 대문자 문장'
      // 대소문자로 바꾼 예시 만들기: 낱말 첫 글자만 대문자. 3글자 이하는 약어로 보고 대문자 그대로 (AM·PM·VIP·KTX…)
      //   caseMinorWords: 문장 가운데에선 소문자 (관사·전치사·접속사) · caseShortWords: 약어가 아닌 흔한 짧은 낱말 (첫 글자만 대문자)
      caseMinorWords: [
        "a", "an", "the", "and", "or", "but", "nor", "of", "to", "in", "on", "at", "by", "for", "from", "with", "as", "via",
        "per"
      ],
      caseShortWords: [
        "is", "it", "its", "be", "if", "no", "so", "up", "we", "my", "do", "go", "out", "all", "you", "are", "not", "one", "our",
        "new", "now", "get", "how", "who", "why", "can", "has", "had", "was", "day", "art", "fun", "big", "see", "let", "off",
        "own", "air", "sun", "sea", "old", "end", "top", "pop", "jam", "run", "joy", "red", "box", "bar", "car", "eat", "far",
        "few", "fly", "hot", "key", "kid", "man", "map", "mix", "pay", "pet", "put", "raw", "sit", "six", "sky", "son", "tea",
        "ten", "two", "use", "way", "web", "win", "yes", "zoo", "act", "age", "ask", "bed", "boy", "buy", "cup", "cut", "dry",
        "eye", "fan", "fit", "her", "him", "his", "ice", "lab", "low", "may", "men", "mom", "odd", "she", "toy", "try", "wow",
        "any", "too", "set", "say", "hat"
      ]
    },

    // ---------------------------------------------------------------- 읽기 쉬운 글꼴로 바꾸기 (11/25 확정)
    // 정보 전달 글자에 글꼴 문제(장식·좁은 폭·기울임)가 있으면 이 글꼴로 바꾸기를 제안해요. 예술 글자는 바꾸지 않아요.
    //   KoddiUD 온고딕: 한국장애인개발원이 고령자·저시력자도 알아보기 쉽게 만든 무료 글꼴 (Regular·Bold·ExtraBold)
    //   PostScript 이름: 글꼴 파일의 name 표에서 확인 (11/25, Version 1.000 Build 20201217). 포토샵 실제 확인은 docs/feasibility-checklist.md
    //   글꼴 파일은 굵기마다 옛 가족 이름이 따로예요 ("KoddiUD OnGothic Regular"·"… Bold"·"… ExtraBold", 한국어 "KoddiUD 온고딕 Bold" 등)
    //   묶음 가족 이름은 "KoddiUD OnGothic"(한국어 "KoddiUD 온고딕"). 브라우저·운영체제에 따라 찾히는 이름이 달라서 모두 넣어요
    fontReplace: {
      family: "KoddiUD 온고딕",
      // 브라우저가 설치돼 있는지 확인하고 미리보기를 그릴 때 쓰는 이름
      //   앞에서부터 미리보기에 써요 → 묶음 이름을 먼저, 굵기별 이름은 설치 확인용으로 뒤에
      cssFamilies: ["KoddiUD OnGothic", "KoddiUD 온고딕", "KoddiUD OnGothic Regular", "KoddiUD 온고딕 Regular", "KoddiUD OnGothic Bold", "KoddiUD 온고딕 Bold", "KoddiUDOnGothic-Regular"],
      postScriptNames: { regular: "KoddiUDOnGothic-Regular", bold: "KoddiUDOnGothic-Bold", extraBold: "KoddiUDOnGothic-ExtraBold" },
      weightLabels: { regular: "Regular", bold: "Bold", extraBold: "ExtraBold" },
      // 원래 굵기 → 온고딕 굵기: 400 이하 Regular · 500~700 Bold · 800 이상 ExtraBold (글꼴 이름·스타일 속 단어로 판단, 앞의 것부터)
      weightKeywords: {
        extraBold: ["extrabold", "ultrabold", "black", "heavy", "800", "900"],
        bold: ["semibold", "demibold", "bold", "medium", "500", "600", "700"]
      },
      fauxBoldAs: "bold", // 가짜 굵게(Faux Bold)를 켠 글자
      // 이 문제가 있을 때만 글꼴을 바꿔요 ('영문 전부 대문자'는 글꼴을 바꿔도 그대로라서 빼요)
      fixIssues: ["decorative", "condensed", "italic"],
      // 이미 이 글꼴이면 바꾸지 않아요 (글꼴 이름을 소문자·공백 없이 비교)
      matchNames: ["koddiudongothic", "온고딕"],
      // 한글·영문만 있는 글자만 바꿔요. 다른 글자(중국어·일본어 등)가 섞이면 그대로 둬요
      onlyHangulLatin: true,
      downloadUrl: "https://www.koddi.or.kr/ud/sub1_2",
      adobeFontsUrl: "https://fonts.adobe.com/fonts/koddiud-ongothic",
      // 온고딕을 받기 싫은 디자이너용: '바꿀 글꼴 → 내 컴퓨터 기본 고딕'(env.fontChoice "system")
      //   운영체제에 기본으로 들어 있는 고딕이라 받을 필요가 없어요. env.platform 으로 고르고, 모르면 defaultPlatform
      systemFallbacks: {
        windows: {
          family: "맑은 고딕",
          cssFamilies: ["Malgun Gothic", "맑은 고딕"],
          postScriptNames: { regular: "MalgunGothic", bold: "MalgunGothicBold", extraBold: "MalgunGothicBold" }, // ExtraBold 가 없어서 Bold
          weightLabels: { regular: "Regular", bold: "Bold", extraBold: "Bold" }
        },
        mac: {
          family: "Apple SD 산돌고딕 Neo",
          cssFamilies: ["Apple SD Gothic Neo", "AppleSDGothicNeo-Regular"],
          postScriptNames: { regular: "AppleSDGothicNeo-Regular", bold: "AppleSDGothicNeo-Bold", extraBold: "AppleSDGothicNeo-ExtraBold" },
          weightLabels: { regular: "Regular", bold: "Bold", extraBold: "ExtraBold" }
        }
      },
      defaultPlatform: "windows"
    },

    // ---------------------------------------------------------------- 공통 기준
    // 글자 크기: 관람 거리에서 '글자 높이가 눈에 보이는 각도'(분각, ′)로 판정해요.
    //   정상 시력이 겨우 읽는 글자 ≈ 5′, 편하게 읽는 글자 ≈ 15′ 이상
    //   한글·대문자 높이는 글꼴 크기의 약 0.8배로 계산해요 (glyphHeightRatio)
    size: {
      glyphHeightRatio: 0.8,
      // 영어 소문자는 x-높이(x, a, e 같은 글자 키)로 읽혀서 한글보다 작게 보여요. 보통 산세리프 글꼴의 x-높이는
      // 글꼴 크기의 0.5~0.55배예요 (임시값). 글자 중 영어 소문자가 latinLowercaseShare 이상이면 이 비율로 재요
      latinLowercaseHeightRatio: 0.52,
      latinLowercaseShare: 0.5,
      passArcmin: 15, // 이 이상이면 통과
      warnArcmin: 10, // 이 이상이면 주의, 미만이면 실패
      lowVisionAcuity: 0.3, // 저시력(시력 0.3)에서도 읽히는지 함께 알려줘요
      readableArcminAt1_0: 5, // 시력 1.0이 읽을 수 있는 최소 글자 각도
      // 저시력 기준을 판정에 넣을지: false 면 '참고 정보'로만 보여주고, true 면 통과·추천 크기를 저시력 기준(5′ ÷ 0.3 ≈ 16.7′)까지 올려요
      lowVisionRequired: false,

      // 역할별 기준: 주최·후원·저작권 표기처럼 '그 외' 글자는 핵심 정보보다 덜 엄격하게 봐요
      //   secondaryRoles 의 글자는 secondaryPassArcmin 이상이면 통과, 미만이면 '참고' (자동 수정 목록에 넣지 않음)
      secondaryRoles: ["other"],
      secondaryPassArcmin: 10
    },

    // 대비: WCAG 2.x 기준 (1.4.3). 큰 글자 = 18pt 이상 또는 14pt 이상 굵은 글자
    contrast: {
      normal: 4.5,
      large: 3,
      dimNormal: 7, // 어두운 조명 + 정보 전달
      dimLarge: 4.5,
      largePt: 18,
      largeBoldPt: 14,
      // 배경의 거의 모든 부분(98%)에서 기준을 넘어야 해요. 아주 작은 얼룩 픽셀 몇 개는 무시해요.
      worstPercentile: 0.02,
      // 배경 복잡도 (밝기 편차). busy 이상이면 '그림 위 글자'로 봐요.
      // 샘플 포스터: 단색 배경 0, 그림 위 글자 0.06~0.07
      complexity: { simple: 0.01, busy: 0.04 },
      // 글자 뒤 배경 띠: 이 색들 중 대비가 가장 좋은 색을 골라요
      backplate: {
        colors: ["#FFFFFF", "#1B1A22"],
        paddingMm: 1.5 // 글자 상자 바깥 여백
      }
    },

    // 목적 추천: 제목 크기의 이 비율 이상인 큰 글자는 '예술적 표현'으로 추천해요 (일시·장소 등은 늘 정보 전달)
    purposeSuggestion: {
      artSizeRatio: 0.4
    },

    // ① 글자 굵기: 이 굵기로 추정되는 글꼴은 '얇은 글씨'로 봐요 (글꼴 이름의 Thin·Light 등)
    weight: {
      thinWeights: ["light"],
      // 얇아도 이만큼 크면 괜찮다고 봐요 (pt). 큰 제목용 얇은 글꼴은 흔해요
      okAbovePt: 36
    },

    // ③ 글자 크기를 키울 때 (확대·재배치): 포스터 밖으로 나가거나 다른 글자와 겹치는지
    layout: {
      canvasMarginPx: 0, // 이만큼 안쪽까지만 허용 (재단선 여백을 두려면 늘려요)
      // 겹치는 글자끼리 '겹치지 않는 최대 크기'를 찾을 때: 한 번에 이만큼씩 함께 키우고, 최대 이만큼 되풀이해요
      fitStep: 1.02, fitMaxRounds: 200,
      // 그때 남기는 좌우 가장자리 여백 = 포스터 폭의 이 비율 (임시값).
      //   줄 사이 여백은 아래 hierarchy.crowdedGapEm 하나로 정해요 — 키운 뒤 다시 검사해도 '붙어 있음'이 새로 생기지 않게
      fitMarginOfWidth: 0.05,
      // 줄 사이를 잴 때 여유 (px). 키운 글자를 다시 그리면 글자 상자가 예상보다 몇 px 달라져요 (임시값)
      gapSafetyPx: 3,
      overlapTolerancePx: 2 //이 정도 겹침은 무시 (글자 상자 가장자리 오차)
    },

    // 화면 낭독기가 이상하게 읽는 글자 (11/27). 항상 '참고'예요 — 글자 모양은 디자이너 뜻이라 바꾸지 않고,
    //   대체텍스트 초안에는 읽기 좋은 글로 바꿔 넣어요 (roles.speakable). 근거:
    //   - 다른 문자(키릴·그리스) 닮은 글자: PowerMapper 화면 낭독기 시험 'Look alike unicode chars'에서 98개 조합 모두 문제
    //   - 꾸민 영문(𝓗𝓮𝓵𝓵𝓸, Ⓐ): 'mathematical bold script capital h'처럼 글자 이름을 하나씩 읽어요 (Scope, inputoutput.dev)
    //   - 장식 기호(★, 결합 기호 ͞): 기호 이름을 읽거나 건너뛰어요 (Scope 'screen readers and special characters')
    //   - 글자 사이 띄어쓰기(S A L E): 단어가 아니라 한 글자씩 읽어요 (WCAG 실패 사례 F32, 1.3.2)
    speech: {
      // 영문 한 글자씩 띄어 쓴 글자가 이만큼 이어지면 '띄어 쓴 단어' (S A L E = 4). 두 글자(A B)는 약어일 수 있어 넘겨요
      spacedLettersMin: 3,
      // 영어 단어 속에 섞인 닮은 글자 → 읽을 영문자 (Unicode 'confusables' 중 포스터에서 쓰는 것)
      lookAlike: {
        "а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x",
        "ш": "w", "щ": "w", "п": "n", "и": "u", "л": "n", "я": "r", "ь": "b", "ѕ": "s", "і": "i", "ј": "j", "һ": "h", "ԁ": "d", "ԛ": "q", "ԝ": "w",
        "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "Я": "R", "Ш": "W", "П": "N", "И": "N", "Д": "A", "Ф": "O", "Ж": "X",
        "α": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x", "ω": "w", "λ": "A", "Σ": "E", "Δ": "A", "Λ": "A", "Π": "N",
        "Α": "A", "Β": "B", "Ε": "E", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X", "Ζ": "Z"
      },
      // 기호여도 화면 낭독기가 뜻대로 읽어서 괜찮은 것: 화살표(→), ©®™, ℃, ※, 원 숫자(①)
      //   '○○'(○○문화재단)은 이름을 가린 자리(아무개)라 빼면 뜻이 달라져서 그대로 둬요
      okSymbols: "©®™℃℉※→←↑↓↔①②③④⑤⑥⑦⑧⑨⑩○",
      labels: {
        lookAlike: "다른 문자 닮은 글자",
        styled: "꾸민 영문 글자",
        symbols: "장식 기호",
        spaced: "한 글자씩 띄어 쓴 단어"
      },
      // 대체텍스트 초안에 들어가는 글자(제목·일시·장소·가격·접근성)
      message: "화면 낭독기는 이 글자를 보이는 대로 읽지 못해요({what}). 대체텍스트 초안에는 “{readAs}”처럼 넣었어요. 웹·SNS 본문에 글을 옮길 때도 이렇게 써 주세요.",
      // 그 밖의 글자
      messageOther: "화면 낭독기는 이 글자를 보이는 대로 읽지 못해요({what}). 웹·SNS 본문이나 대체텍스트에 옮길 때는 “{readAs}”처럼 써 주세요.",
      messageDropped: "화면 낭독기는 이 글자를 보이는 대로 읽지 못해요({what}). 꾸밈 기호뿐이라 대체텍스트·본문에는 넣지 않아도 돼요."
    },

    // ④ 텍스트 간격 (WCAG 1.4.12)
    //   WCAG 1.4.12 는 '사용자가 간격을 이만큼 늘려도 내용이 깨지지 않아야 한다'는 웹 기준이에요.
    //   인쇄 포스터에서는 정보 글자의 권장값으로 써요. 예술 글자에는 '참고'로만 알려요.
    spacing: {
      // 여러 줄 글자의 줄 간격 (글자 크기의 배수). 본문 크기 글자에만 (11/26)
      //   근거: WCAG 1.4.8(AAA)의 '1.5배'는 '문단 안' 줄 간격이고, 1.4.12의 1.5배는 사용자가 넓혀도 깨지지 않아야 한다는 값이지
      //   글을 그렇게 써야 한다는 값이 아니에요. 큰 제목은 원래 줄 간격을 좁게 써요 (FOREVER/PROUD 0.86배)
      lineHeightMin: 1.5,
      // 큰 글자(대비의 '큰 글자'와 같은 기준)는 줄끼리 닿을 만큼 좁을 때만 잡아요. 임시값: 대문자 제목에 흔한 0.85~1.0배는 넘겨요
      lineHeightLargeMin: 0.8,
      // 자간(em, 포토샵 자간 숫자 ÷ 1000)이 이보다 좁으면 '너무 붙어 있음' (11/25: 0 → -0.05, 포토샵 자간 -50)
      //   근거: 읽기 속도는 표준 글자 간격 근처에서 가장 빠르고 그보다 좁거나 넓으면 느려져요 (Chung 2002; Yu 외 2007).
      //   중심 시력을 잃은 사람의 최적 간격도 표준의 0.95±0.06배로 표준과 차이가 없었어요 (Chung 2012, Optom Vis Sci 89(9)).
      //   한글은 글자 폭이 글자 크기와 거의 같아서 -0.05em ≈ 표준 간격의 0.95배 → 이보다 좁을 때만 잡아요.
      //   흔한 살짝 좁힌 자간(-10~-30)은 넘겨요. 영문 고정폭 실험이라 한글은 당사자 테스트로 확인 필요 (임시값)
      //   WCAG 권장 0.12 는 사용자가 넓혀도 깨지지 않아야 한다는 값이라 기준으로 쓰지 않아요
      letterSpacingMin: -0.05,
      letterSpacingFixTo: 0, // 고칠 때는 글꼴 기본 간격으로
      letterSpacingWcag: 0.12,
      wordSpacingWcag: 0.16
    },

    // ⑤ 정보 계층 및 그룹화
    hierarchy: {
      titleRatioMin: 1.5, // 제목이 본문(중간 크기)보다 이 배수 이상 커야 구별돼요
      // 본문 = 제목보다 확실히 작은 글자 (제목 크기의 이 비율 미만). 제목만큼 큰 숫자·날짜(01 · 06)는 디자인 요소라 빼고 비교해요 (11/26)
      bodyMaxRatioOfTitle: 0.9,
      relatedPairs: [["date", "place"]], // 가까이 있어야 하는 정보
      relatedMaxGapRatio: 0.12, // 두 정보 사이 거리가 포스터 높이의 이 비율보다 멀면 '떨어져 있음'
      crowdedGapEm: 0.3, // 위아래 글자 묶음 사이가 글자 크기의 이 배수보다 좁으면 '붙어 있음'
      maxTextCoverage: 0.4 // 글자 상자가 포스터 면적의 이 비율보다 많으면 '밀집'
    },

    // ---------------------------------------------------------------- 색각이상 (색 의존 정보, WCAG 1.4.1)
    colorVision: {
      types: ["protan", "deutan", "tritan"],
      labels: { protan: "적색맹", deutan: "녹색맹", tritan: "청색맹" },
      // 두 색의 OKLab 거리가 이보다 작으면 '거의 같은 색'으로 봐요 (작은 글자에서 구분하기 어려운 정도)
      minDeltaE: 0.08,
      // 크기 차이가 이 비율 안이면 '같은 크기'로 봐요 (색만 다른 강조인지 볼 때)
      sameSizeRatio: 0.1,
      // 색만 다른 두 글자색을 고칠 때: 색각이상 눈으로 봐도 두 색의 OKLab 거리가 이만큼 되게 밝기를 바꿔요 (minDeltaE의 1.5배) — 임시값
      fixDeltaE: 0.12,
      // 색각이상 대비 수정을 찾을 때 일반 눈 대비 목표를 이만큼씩 올려 가며 찾아요 (최대 fixMaxContrast)
      fixStep: 0.5,
      fixMaxContrast: 15,
      // 색만 다른 강조를 고칠 때 강조 색마다 넣는 모양 (위에서부터 차례로, 짧은 강조부터).
      //   강조가 둘 이상이면 서로 다른 모양을 줘야 강조끼리도 색 없이 구분돼요 (예: 매진=굵게+밑줄, 예매 가능=굵게)
      emphasisStyles: [{ bold: true, underline: true }, { bold: true }, { underline: true }]
    },

    // ---------------------------------------------------------------- 정보 전달 지도 (검토 우선순위)
    //   실제 시선 측정이 아니라 '정보 중요도 × 알아보기 어려운 정도'로 어디부터 볼지 정해요.
    //   우선순위 = 중요도 × (1 − 식별 쉬움),  식별 쉬움 = min(크기 점수, 대비 점수) × 위치 점수
    priorityMap: {
      importance: { title: 0.9, date: 1, place: 1, price: 0.8, access: 0.9, other: 0.3 },
      edgeBand: 0.06, // 포스터 가장자리 이 비율 안에 붙은 글자는
      edgeFactor: 0.8, //   식별 쉬움에 이 값을 곱해요 (가장자리는 덜 눈에 띄어요)
      levels: { high: 0.5, mid: 0.25 } // 우선순위 이 이상: 높음(먼저 검토) / 중간 / 그 아래: 낮음(잘 보임)
    },

    // 핵심 정보: 이 역할이 포스터에 없으면 '누락'으로 알려요
    essentialRoles: ["title", "date", "place"],

    // 원래 '정보 전달'로 추천하는 역할이에요. 이 글자를 예술로 정하면(디자이너 지정, 문서 전체 예술,
    // 또는 가장 큰 글자라 제목이 된 경우) 판정은 '참고'로 하되, 대체텍스트·안내문에 넣으라고 알려요.
    keyInfoAsArt: {
      roles: ["date", "place", "price", "access"]
    },

    // ---------------------------------------------------------------- 공통 문구
    // 목적(예술/정보)과 상관없이 쓰는 안내 문구예요. 목적별 문구는 아래 purposes.*.messages 에 있어요.
    // {중괄호} 자리는 엔진이 채워요: {pt} 글자 크기 · {role} {roleA} {roleB} 역할 이름(일시·장소…)
    //   {viewer} 보는 사람(예: "저시력 (0.3) 기준으로 ") · {percent} 포스터 높이 대비 % · {blendMode} 혼합 모드
    //   {cm} 한 번에 보이는 지름 · {count} 핵심 정보가 흩어진 곳 수
    messages: {
      // 글자 크기
      sizeSecondary: "주최·후원 같은 부가 정보라서 핵심 정보보다 덜 엄격하게 봐요. 그래도 읽히게 하려면 {pt}pt 이상을 권장해요.",
      sizeTooBig: "{viewer}읽으려면 글자가 {pt}pt(포스터 높이의 {percent}%)는 돼야 해요. 포스터 글자만 키워서는 어려워요. 큰 글씨 안내문이나 대체텍스트를 함께 제공해 주세요.",
      largePrintNotice: "큰 글씨 안내문(A4, 고대비)을 만들어 포스터 옆에 붙이거나 QR로 연결해 주세요.",
      // 대비
      contrastUnreadable: "글자색이나 배경을 읽지 못해 대비를 계산하지 못했어요",
      blendModeNote: "혼합 모드({blendMode}) 때문에 실제 보이는 색이 다를 수 있어요",
      conflict: "정보 글자가 예술 이미지 위에 있어서, 그림을 가리지 않고는 기준을 넘기 어려워요. 같은 정보를 다른 곳(대체텍스트, 별도 안내문)에서도 제공해 주세요.",
      altTextNotice: "포스터 아래나 SNS 본문에 같은 정보를 글로 함께 적어 주세요.",
      // 글꼴 바꾸기 ({family} 글꼴 이름 · {weight} 굵기 · {url} 한국장애인개발원 받는 곳 · {adobeUrl} Adobe Fonts)
      fontReplace: "저시력자도 알아보기 쉽게 만든 {family} {weight}로 바꾸기를 제안해요.",
      // 브라우저가 글꼴을 못 찾았을 때 (Adobe Fonts로 켠 글꼴은 브라우저에 안 보일 수 있어요). 적용은 그대로 할 수 있어요
      fontNotInstalled: "이 컴퓨터에서 {family}을 찾지 못해 미리보기는 비슷한 고딕으로 그렸어요. 고친 PSD를 포토샵에서 열 때 글꼴이 없으면 Adobe Fonts로 켤 수 있어요(Creative Cloud 로그인 필요, {adobeUrl}). 한국장애인개발원 누리집에서 무료로 받아도 돼요: {url}",
      fontReplaceSystem: "받을 필요 없는 {family} {weight}로 바꾸기를 제안해요. 저시력자용으로 만든 {recommended}이 더 알아보기 쉬우니, 받을 수 있으면 '부가 기능 → 바꿀 글꼴'에서 바꿔 주세요.",
      fontSystemHint: "글꼴을 받기 싫다면 '부가 기능 → 바꿀 글꼴'에서 내 컴퓨터 기본 고딕을 고를 수 있어요.",
      // 영문 전부 대문자 ({text} 대소문자로 바꾼 예시)
      allCapsLong: "긴 영문 문장을 전부 대문자로 쓰면 읽는 속도가 느려질 수 있어요(짧은 문구는 괜찮아요). 대소문자를 섞어 써 보세요. 예: “{text}”",
      allCapsSetting: "포토샵 '모두 대문자' 설정으로 대문자가 된 글자라, 설정을 끄면 위처럼 입력한 대로 보여요. 첫 글자만 대문자로 하고 싶으면 포토샵에서 글을 고쳐 주세요.",
      fontScriptKept: "중국어·일본어 같은 글자가 섞여 있어 글꼴은 그대로 둬요({family}은 한글·영문 글꼴이에요). 크기와 대비를 먼저 고쳐 주세요.",
      // 색각이상
      colorOnly: "색을 구분하기 어려운 사람도 알 수 있게 굵게·밑줄·기호(●, ★)·괄호 같은 모양으로도 구분해 주세요 (WCAG 1.4.1).",
      colorOnlyFix: "자동 수정은 강조한 부분을 굵게 하고 밑줄을 그어요.",
      colorOnlyFixWithColor: "자동 수정은 강조한 부분을 굵게 하고 밑줄을 그어요 (밝기도 함께 바꿔요).",
      colorOnlyFixMulti: "자동 수정은 강조한 부분마다 굵게·밑줄을 다르게 넣어, 강조끼리도 모양으로 구분해요.",
      cvdContrast: "빨강·초록처럼 색은 다르지만 밝기가 비슷한 조합은 색각이상이 있으면 잘 안 보여요. 글자와 배경의 밝기 차이를 더 크게 해 주세요.",
      // 확대 후 배치
      layoutAfterResize: "여러 줄로 나누거나, 위치를 옮기거나, 주변 여백을 늘려 주세요.",
      layoutMaxFit: "지금 자리에서 겹치지 않는 최대 크기는 {pt}pt예요.",
      layoutNow: "글자끼리 겹치거나 잘리면 읽기 어려워요. 위치나 간격을 조정해 주세요.",
      // 정보 계층·묶음
      titleRatio: "제목과 본문의 크기 차이가 작아 무엇이 제목인지 알기 어려워요. 제목을 키우거나 본문을 줄여 주세요.",
      relatedFar: "{roleA}와(과) {roleB}이(가) 멀리 떨어져 있어요. 함께 읽어야 하는 정보는 가까이 모아 주세요.",
      crowded: "글자 묶음이 너무 붙어 있어 한 덩어리로 보여요. 사이 여백을 늘려 주세요.",
      textCoverage: "글자가 너무 많아 복잡해 보여요. 덜 중요한 정보는 줄이거나 다른 곳으로 옮겨 주세요.",
      missingRole: "{role}이(가) 포스터에 없거나 이미지로 되어 있어요. 관람에 꼭 필요한 정보예요.",
      keyInfoSmall: "{role}이(가) 다른 글자보다 작아요. 눈에 잘 띄게 키우거나 굵게 해 주세요.",
      // 좁은 시야
      fieldGathered: "흩어진 핵심 정보를 한곳에 모은 글자(핵심 정보 띠)가 있어요.",
      fieldScattered: "시야가 좁은 사람은 한 번에 지름 {cm}cm만 보여요. 핵심 정보를 보려면 시선을 {count}번 옮겨 찾아야 해요. 일시·장소·가격·접근성 정보를 한곳에 모아 주세요. 자동 수정은 핵심 정보를 한데 모은 '핵심 정보 띠'를 새 글자 레이어로 넣어요 (원래 글자는 그대로).",
      fieldLargePrintNotice: "큰 글씨 안내문에도 핵심 정보를 한곳에 모아 포스터 옆에 함께 붙여 주세요."
    },

    // ---------------------------------------------------------------- 목적별 정책
    purposes: {
      art: {
        label: "예술적 표현",
        judge: "advisory", // 기준 미달이어도 '실패' 대신 '참고'
        fix: {
          strategy: "minimal",
          maxLightnessShift: 0.12, // OKLCH 밝기(0~1)를 이만큼까지만 바꿔요
          allowSize: false,
          allowWeight: false,
          allowSpacing: false,
          allowBackplate: true,
          backplateMaxOpacity: 0.45 // 옅은 배경 띠만
        },
        applyAll: false, // '모두 적용' 버튼 숨김
        support: "alternative", // 원본을 지키는 대신 대체 정보 제공
        messages: {
          keyInfoAsArt: "일시·장소·가격·접근성 정보는 원래 정보 전달로 추천하는 글자예요. 예술로 정한 대로 '참고'로만 알려 드릴게요. 대신 같은 정보를 대체텍스트나 안내문에도 꼭 넣어 주세요.",
          contrast: "원본의 분위기를 지키면서, 글자 밝기를 조금만 조정하면 더 잘 보일 수 있어요.",
          size: "작가의 의도에 맞는 크기라면 그대로 두셔도 괜찮아요. 같은 내용을 다른 곳에서도 안내하면 좋아요.",
          weight: "얇은 글꼴이 분위기를 만든다면 그대로 두셔도 괜찮아요. 작게 쓰인 곳만 조금 굵게 하면 더 잘 보여요.",
          spacing: "글자 사이가 좁으면 멀리서 글자끼리 붙어 보일 수 있어요.",
          font: "글꼴이 분위기를 만든다면 그대로 두셔도 괜찮아요. 같은 정보를 읽기 쉬운 글꼴로 다른 곳에 함께 적어 주면 좋아요."
        }
      },
      info: {
        label: "정보 전달",
        judge: "strict",
        fix: {
          strategy: "full",
          maxLightnessShift: 1,
          allowSize: true,
          allowWeight: true,
          allowSpacing: true,
          allowBackplate: true,
          backplateMaxOpacity: 0.9,
          allowFont: true // 읽기 쉬운 글꼴(fontReplace)로 바꾸기
        },
        applyAll: true,
        support: "accessibleVersion", // 별도 접근성 버전 만들기
        messages: {
          contrast: "글자와 배경의 대비가 낮아 읽기 어려울 수 있어요. 아래 색으로 바꾸면 기준을 넘어요.",
          // 색·배경 띠로도 기준을 못 넘을 때 (그림 위 글자인데 복합 목적이라 배경 띠를 막은 경우는 '충돌' 문구를 써요)
          contrastNoFix: "글자와 배경의 대비가 낮아 읽기 어려워요. 글자색이나 배경 띠만으로는 기준을 넘기 어려워서, 배경색을 바꾸거나 글자를 다른 곳으로 옮기는 방법도 함께 검토해 주세요.",
          size: "관람 거리에 비해 글자가 작아요. 추천 크기 이상으로 키워 주세요.",
          weight: "얇은 글씨는 작거나 멀리서 볼 때 획이 끊겨 보여요. 더 굵은 글꼴(Regular 이상)로 바꿔 주세요.",
          spacing: "줄이나 글자 사이가 좁아 읽기 어려울 수 있어요. 아래 간격으로 넓혀 주세요.",
          font: "장식·손글씨체, 폭이 좁거나 기울어진 글꼴은 저시력자가 글자를 알아보기 어려워요. 민무늬 고딕(산세리프) 계열의 보통 폭, 바로 선 글꼴로 바꿔 주세요."
        }
      },
      mixed: {
        label: "복합 목적",
        // 레이어마다 art / info 정책을 따르되, 정보 글자를 고칠 때 '예술 요소(그림)를 가리는 수정'은 하지 않아요
        allowBackplateOverArt: false,
        support: "alternative"
      }
    }
  };
});
