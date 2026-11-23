"""마스킹 프로토타입 테스트. 모든 값은 가짜 데이터다.

실행: backend/ 에서 `pytest tests/test_privacy.py`
"""

import unittest

from app.privacy import OcrLine, detect_pii, mask_ocr_lines

# 가짜 값 (실제 사람 정보 아님)
FAKE_RRN = "900101-1234567"
FAKE_ARN = "900101-5234567"
FAKE_PHONE = "010-0000-1234"
FAKE_EMAIL = "test.user@example.com"
FAKE_ADDR = "서울특별시 가나구 다라로 12"
FAKE_NAME = "홍길동"


def mask(*texts: str):
    return mask_ocr_lines([OcrLine(text=t) for t in texts])


class TestMaskOcrLines(unittest.TestCase):
    """US-01 정상: 문서 속 개인정보를 모두 가린다 / R1: 가린 텍스트만 LLM에 보낸다."""

    def test_us01_value_patterns_masked(self):
        r = mask(
            f"주민등록번호 {FAKE_RRN}",
            f"외국인등록번호 {FAKE_ARN}",
            f"휴대전화 {FAKE_PHONE}",
            f"이메일 {FAKE_EMAIL}",
        )
        for raw in (FAKE_RRN, FAKE_ARN, FAKE_PHONE, FAKE_EMAIL):
            self.assertNotIn(raw, r.masked_text)
        self.assertIn("[주민등록번호]", r.masked_text)
        self.assertIn("[외국인등록번호]", r.masked_text)
        self.assertIn("[전화번호]", r.masked_text)
        self.assertIn("[이메일]", r.masked_text)
        self.assertFalse(r.residual)

    def test_us01_label_values_masked(self):
        r = mask(f"성명: {FAKE_NAME}", "생년월일 1990.01.01", f"주소: {FAKE_ADDR}")
        self.assertNotIn(FAKE_NAME, r.masked_text)
        self.assertNotIn("1990.01.01", r.masked_text)
        self.assertNotIn("다라로", r.masked_text)
        self.assertEqual(r.lines[0].text, "성명: [이름]")

    def test_us01_two_labels_in_one_line(self):
        r = mask(f"성명 {FAKE_NAME} 생년월일 1990.01.01")
        self.assertEqual(r.lines[0].text, "성명 [이름] 생년월일 [생년월일]")

    def test_us01_name_followed_by_phone(self):
        r = mask(f"성명: {FAKE_NAME} {FAKE_PHONE}")
        self.assertEqual(r.lines[0].text, "성명: [이름] [전화번호]")

    def test_us01_foreign_name_label(self):
        r = mask("Name: NGUYEN VAN A")
        self.assertNotIn("NGUYEN", r.masked_text)

    def test_l1_blank_form_field_kept(self):
        """빈칸 라벨은 그대로 둔다. L1이 칸을 추론하려면 라벨이 필요하다."""
        r = mask("성명: ________", "주소 (          )", "전화번호")
        self.assertEqual(r.masked_text, "성명: ________\n주소 (          )\n전화번호")
        self.assertEqual(r.findings, [])

    def test_l1_non_personal_text_kept(self):
        r = mask("신청일 2026.11.17", "※ 해당 칸에 체크하세요", "제1조(목적)")
        self.assertEqual(
            r.masked_text, "신청일 2026.11.17\n※ 해당 칸에 체크하세요\n제1조(목적)"
        )

    def test_l1_hyphen_dates_kept(self):
        """신청일·기한 날짜는 개인정보가 아니고 L1에 필요하다."""
        r = mask("신청일 2026-11-17", "기한 2026/12/31")
        self.assertEqual(r.masked_text, "신청일 2026-11-17\n기한 2026/12/31")

    def test_us01_birth_date_with_hyphen_masked(self):
        r = mask("생년월일: 1990-01-01")
        self.assertEqual(r.lines[0].text, "생년월일: [생년월일]")

    def test_us01_label_with_parenthesis(self):
        r = mask(f"성명(한글) {FAKE_NAME}")
        self.assertEqual(r.lines[0].text, "성명(한글) [이름]")

    def test_us01_international_phone(self):
        r = mask("Tel: +82-10-0000-1234")
        self.assertEqual(r.lines[0].text, "Tel: [전화번호]")

    # --- PR 리뷰에서 재현된 사례 (회귀 방지) ---

    def test_review_date_between_label_and_name(self):
        """[치명] 라벨과 이름 사이 날짜 때문에 이름이 통째로 새던 문제."""
        r = mask(f"성명: 2026-11-17 {FAKE_NAME}")
        self.assertNotIn(FAKE_NAME, r.masked_text)

    def test_review_value_in_parentheses(self):
        """[치명] 띄어 쓴 괄호 안의 값이 통째로 새던 문제."""
        r = mask(
            f"성명 ({FAKE_NAME})", "생년월일 (1990-01-01)", "주소 (서울 종로구 1번지)"
        )
        self.assertEqual(
            r.masked_text, "성명 ([이름])\n생년월일 ([생년월일])\n주소 ([주소])"
        )

    def test_review_label_value_does_not_swallow_next_label(self):
        """[중요] 라벨 값이 같은 줄의 다른 라벨(신청일·배우자)을 삼키던 문제."""
        r = mask(
            "생년월일 1990-01-01 신청일 2026-11-17",
            "신청인 생년월일 1990-01-01 배우자 생년월일 1985-05-05",
            f"성명 {FAKE_NAME} 국적 베트남",
        )
        self.assertEqual(
            r.masked_text,
            "생년월일 [생년월일] 신청일 2026-11-17\n"
            "신청인 생년월일 [생년월일] 배우자 생년월일 [생년월일]\n"
            "성명 [이름] 국적 베트남",
        )

    def test_review_no_false_residual_across_token(self):
        """[중요] 토큰 양쪽 숫자가 이어져 깨끗한 문서를 residual로 막던 문제."""
        r = mask("654321 user@example.com 0998877")
        self.assertFalse(r.residual)

    def test_review_no_false_residual_from_token_text(self):
        """토큰 안 글자('[주소]'의 '주소')가 라벨로 다시 잡혀 residual이 되면 안 된다."""
        r = mask(f"주소: {FAKE_ADDR}", "생년월일 1990.01.01", f"성명 ({FAKE_NAME})")
        self.assertFalse(r.residual)

    def test_review2_no_false_residual_after_label_token(self):
        """[2차 리뷰] 토큰 뒤 평범한 글자를 남은 라벨 값으로 보던 오탐."""
        r = mask(
            "생년월일 1990-01-01이고 신청일 2026-11-17",
            f"주소 {FAKE_ADDR} 입니다",
        )
        self.assertEqual(
            r.masked_text,
            "생년월일 [생년월일]이고 신청일 2026-11-17\n주소 [주소] 입니다",
        )
        self.assertFalse(r.residual)

    def test_review2_residual_still_catches_leak_after_token(self):
        """토큰 뒤에 값 모양 개인정보가 남으면 여전히 잡는다."""
        from app.privacy import _has_residual

        self.assertTrue(_has_residual(f"주소 [주소] 입니다 {FAKE_PHONE}"))
        self.assertTrue(_has_residual(f"성명: [이름] 주민등록번호 {FAKE_RRN}"))

    def test_review_particle_ro_is_not_address(self):
        """[중요] 조사 '로'를 도로명으로 오인하던 문제."""
        r = mask("연락처로 123 번 주세요")
        self.assertEqual(r.masked_text, "연락처로 123 번 주세요")

    def test_road_with_beongil_masked(self):
        r = mask("다라로12번길 34", "가나동 123번지")
        self.assertEqual(r.masked_text, "[주소]\n[주소]")

    def test_residual_detects_leftover(self):
        """residual 검사는 토큰은 넘기고 남은 개인정보는 잡는다."""
        from app.privacy import _has_residual

        self.assertTrue(_has_residual(f"성명: {FAKE_NAME}"))
        self.assertTrue(_has_residual(f"전화 {FAKE_PHONE}"))
        self.assertFalse(_has_residual("성명: [이름] 생년월일 [생년월일]"))

    @unittest.expectedFailure
    def test_known_limit_name_in_sentence(self):
        """[한계] 라벨 없이 문장 속에 있는 이름은 규칙으로 못 찾는다. data-flow.md 4절 참고."""
        r = mask(f"저는 {FAKE_NAME}입니다")
        self.assertNotIn(FAKE_NAME, r.masked_text)

    def test_unlabeled_long_number_masked(self):
        """계좌·여권 번호처럼 종류를 모르는 긴 숫자도 가린다 (넘치게 가리는 쪽을 택함)."""
        r = mask("입금 계좌 110-123-456789")
        self.assertNotIn("456789", r.masked_text)

    def test_bbox_and_page_kept(self):
        bbox = {"page": 2, "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.04}
        r = mask_ocr_lines([OcrLine(text=f"전화 {FAKE_PHONE}", page=2, bbox=bbox)])
        self.assertEqual(r.lines[0].page, 2)
        self.assertEqual(r.lines[0].bbox, bbox)

    def test_r8_findings_hold_no_raw_value(self):
        """R8: 감지 결과에는 위치·종류만 있고 원문 값은 없다."""
        r = mask(f"전화 {FAKE_PHONE}")
        self.assertEqual(len(r.findings), 1)
        self.assertNotIn(FAKE_PHONE, repr(r.findings))
        self.assertEqual(r.findings[0].kind, "phone")
        self.assertEqual(r.findings[0].line, 0)


class TestOcrMisread(unittest.TestCase):
    """EasyOCR 실측(2026-11-23)에서 오인식 때문에 가려지지 않고 residual=False로 통과한 사례.

    인식 결과 문자열은 실측 출력 그대로다 (가짜 신청서).
    """

    def test_phone_with_letter_o(self):
        """숫자 0을 영문 O로 읽은 전화번호 — 라벨 없이도 정규화 후 값 모양으로 잡는다."""
        r = mask("휴대전화 O1O-0000-1234", "O1O-0000-1234")
        self.assertEqual(r.masked_text, "휴대전화 [전화번호]\n[전화번호]")
        self.assertFalse(r.residual)

    def test_email_missing_dots(self):
        r = mask("이메일 test user@example com", "testuser@example com")
        self.assertNotIn("example", r.masked_text)
        self.assertNotIn("@", r.masked_text)
        self.assertEqual(r.lines[0].text, "이메일 [이메일]")
        self.assertFalse(r.residual)

    def test_misread_labels(self):
        """라벨 한 글자를 잘못 읽어도(생년원일·이데일) 라벨 뒤 값을 가린다."""
        r = mask("생년원일 1990.0101", "이데일 testuser@example com")
        self.assertEqual(r.masked_text, "생년원일 [생년월일]\n이데일 [이메일]")

    def test_phone_label_masks_unknown_shape(self):
        """값 모양이 깨져도 전화 라벨 뒤 값은 통째로 가린다."""
        r = mask("연락처: 010 OOOO 1234")
        self.assertEqual(r.lines[0].text, "연락처: [전화번호]")

    def test_residual_catches_unrecognized_leftovers(self):
        """규칙이 못 알아본 '@'나 9자리 이상 숫자가 남으면 residual로 막는다."""
        from app.privacy import _has_residual

        self.assertTrue(_has_residual("참고 abc @ def"))
        self.assertTrue(_has_residual("번호 0100 0001 234"))
        self.assertFalse(_has_residual("신청일 2026-11-23 기한 2026-12-31"))

    def test_normalize_keeps_words(self):
        """영문 단어·짧은 숫자는 바꾸지 않는다."""
        from app.privacy import normalize_ocr_text

        self.assertEqual(normalize_ocr_text("HONG GILDONG"), "HONG GILDONG")
        self.assertEqual(normalize_ocr_text("결혼이민(F-6)"), "결혼이민(F-6)")
        self.assertEqual(normalize_ocr_text("Tel O1O-0000-1234"), "Tel 010-0000-1234")

    def test_blank_name_before_sign_mark_not_masked(self):
        """'성명: ____ (인)'은 빈칸이다. '(인)'까지 이름으로 가리면 서명란이 사라진다."""
        r = mask("작성자 성명: ____________ (인)", "보호자 성명: (서명 또는 인)")
        self.assertEqual(
            r.masked_text, "작성자 성명: ____________ (인)\n보호자 성명: (서명 또는 인)"
        )
        r = mask("작성자 성명: 홍길동 (인)")
        self.assertEqual(r.lines[0].text, "작성자 성명: [이름] (인)")

    def test_sentence_starting_with_label_word_not_masked(self):
        """'연락처로', '이번일은'처럼 라벨 글자 뒤에 한글이 붙으면 라벨이 아니다."""
        r = mask("이번일은 연락처로 알려 드립니다")
        self.assertEqual(r.masked_text, "이번일은 연락처로 알려 드립니다")


class TestDetectPii(unittest.TestCase):
    """F-07·R7: 서술형 답변은 가리지 않고 위치만 알려 준다."""

    def test_r7_spans_point_to_value(self):
        text = f"연락은 {FAKE_PHONE} 이나 {FAKE_EMAIL} 로 주세요"
        spans = detect_pii(text)
        self.assertEqual([s.kind for s in spans], ["phone", "email"])
        self.assertEqual(text[spans[0].start : spans[0].end], FAKE_PHONE)
        self.assertEqual(text[spans[1].start : spans[1].end], FAKE_EMAIL)

    def test_r7_plain_answer_has_no_spans(self):
        self.assertEqual(detect_pii("한국어를 더 배우고 싶어서 신청합니다."), [])


if __name__ == "__main__":
    unittest.main()
