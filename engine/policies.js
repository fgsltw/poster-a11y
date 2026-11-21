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
    environments: {
      wall: { label: "벽에 붙이는 포스터", distanceM: 2 },
      flyer: { label: "손에 드는 전단", distanceM: 0.4 },
      sns: { label: "SNS 이미지 (휴대폰)", distanceM: 0.35, screenWidthMm: 65 }
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
      condensed: ["condensed", "narrow", "compressed", "cond", "compact"],
      italic: ["italic", "oblique"],
      allCapsMinLetters: 6 // 영문 대문자만 이 글자 수 이상이면 '전부 대문자'
    },

    // ---------------------------------------------------------------- 공통 기준
    // 글자 크기: 관람 거리에서 '글자 높이가 눈에 보이는 각도'(분각, ′)로 판정해요.
    //   정상 시력이 겨우 읽는 글자 ≈ 5′, 편하게 읽는 글자 ≈ 15′ 이상
    //   한글·대문자 높이는 글꼴 크기의 약 0.8배로 계산해요 (glyphHeightRatio)
    size: {
      glyphHeightRatio: 0.8,
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
      complexity: { simple: 0.01, busy: 0.04 }
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
      overlapTolerancePx: 2 // 이 정도 겹침은 무시 (글자 상자 가장자리 오차)
    },

    // ④ 텍스트 간격 (WCAG 1.4.12)
    //   WCAG 1.4.12 는 '사용자가 간격을 이만큼 늘려도 내용이 깨지지 않아야 한다'는 웹 기준이에요.
    //   인쇄 포스터에서는 정보 글자의 권장값으로 써요. 예술 글자에는 '참고'로만 알려요.
    spacing: {
      lineHeightMin: 1.5, // 여러 줄 글자의 줄 간격 (글자 크기의 배수)
      letterSpacingMin: 0, // 자간이 이보다 좁으면 '너무 붙어 있음' (WCAG 권장 0.12 는 사용자 조정값이라 기본값으로 쓰지 않아요)
      letterSpacingWcag: 0.12,
      wordSpacingWcag: 0.16
    },

    // ⑤ 정보 계층 및 그룹화
    hierarchy: {
      titleRatioMin: 1.5, // 제목이 본문(중간 크기)보다 이 배수 이상 커야 구별돼요
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
      fixMaxContrast: 15
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
          backplateMaxOpacity: 0.9
        },
        applyAll: true,
        support: "accessibleVersion", // 별도 접근성 버전 만들기
        messages: {
          contrast: "글자와 배경의 대비가 낮아 읽기 어려울 수 있어요. 아래 색으로 바꾸면 기준을 넘어요.",
          size: "관람 거리에 비해 글자가 작아요. 추천 크기 이상으로 키워 주세요.",
          weight: "얇은 글씨는 작거나 멀리서 볼 때 획이 끊겨 보여요. 더 굵은 글꼴(Regular 이상)로 바꿔 주세요.",
          spacing: "줄이나 글자 사이가 좁아 읽기 어려울 수 있어요. 아래 간격으로 넓혀 주세요.",
          font: "저시력자는 글자 모양 전체로 단어를 알아봐요. 민무늬 고딕(산세리프) 계열의 보통 폭, 바로 선 글꼴로 바꾸고, 영문은 대소문자를 섞어 써 주세요."
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
