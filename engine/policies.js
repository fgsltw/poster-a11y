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

    // ---------------------------------------------------------------- 공통 기준
    // 글자 크기: 관람 거리에서 '글자 높이가 눈에 보이는 각도'(분각, ′)로 판정해요.
    //   정상 시력이 겨우 읽는 글자 ≈ 5′, 편하게 읽는 글자 ≈ 15′ 이상
    //   한글·대문자 높이는 글꼴 크기의 약 0.8배로 계산해요 (glyphHeightRatio)
    size: {
      glyphHeightRatio: 0.8,
      passArcmin: 15, // 이 이상이면 통과
      warnArcmin: 10, // 이 이상이면 주의, 미만이면 실패
      lowVisionAcuity: 0.3, // 저시력(시력 0.3)에서도 읽히는지 함께 알려줘요
      readableArcminAt1_0: 5 // 시력 1.0이 읽을 수 있는 최소 글자 각도
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
          allowBackplate: true,
          backplateMaxOpacity: 0.45 // 옅은 배경 띠만
        },
        applyAll: false, // '모두 적용' 버튼 숨김
        support: "alternative", // 원본을 지키는 대신 대체 정보 제공
        messages: {
          contrast: "원본의 분위기를 지키면서, 글자 밝기를 조금만 조정하면 더 잘 보일 수 있어요.",
          size: "작가의 의도에 맞는 크기라면 그대로 두셔도 괜찮아요. 같은 내용을 다른 곳에서도 안내하면 좋아요."
        }
      },
      info: {
        label: "정보 전달",
        judge: "strict",
        fix: {
          strategy: "full",
          maxLightnessShift: 1,
          allowSize: true,
          allowBackplate: true,
          backplateMaxOpacity: 0.9
        },
        applyAll: true,
        support: "accessibleVersion", // 별도 접근성 버전 만들기
        messages: {
          contrast: "글자와 배경의 대비가 낮아 읽기 어려울 수 있어요. 아래 색으로 바꾸면 기준을 넘어요.",
          size: "관람 거리에 비해 글자가 작아요. 추천 크기 이상으로 키워 주세요."
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
