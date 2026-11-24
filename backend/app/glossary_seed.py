# 용어 사전 시드 (WORD-EXPLAIN-API.md "운영 방식": 용어 사전 추가·수정은 API 없이 시드 데이터로 넣는다).
# db.init_db()가 (term, language) 기준으로 넣고, 이미 있으면 설명을 이 값으로 바꾼다 → 이 목록이 사전의 출처다.
#
# 범위: 샘플 신청서·동의서에 나오는 칸 이름과 안내 문구부터 (WORD-EXPLAIN-API.md "용어 사전 초기 데이터").
# 설명 언어: 베트남어(vi) 하나 (VIETNAMESE-SCOPE.md "번역 방향").
# 조회는 정확히 일치라서(항목 1) 화면에 보이는 모양 그대로 넣는다. 조사가 붙은 말은 넣지 않는다.
#
# [확인 필요] 아래 베트남어 설명은 Claude 초안이다. 팀(베트남어 검토자)이 검증한 뒤 쓴다 (R5 "팀이 검증해 구축").

GLOSSARY_LANGUAGE = "vi"

SEED_GLOSSARY = [
    # ── 신청서 칸 이름 ──
    ("신청인", "Người nộp đơn. Là người đứng tên và gửi đơn này."),
    ("신청일", "Ngày nộp đơn. Ghi ngày bạn viết và nộp đơn này."),
    ("성명", "Họ và tên. Ghi đúng như trên hộ chiếu hoặc thẻ người nước ngoài."),
    (
        "성명(한글)",
        "Họ và tên viết bằng chữ Hàn (Hangul). Ghi giống như trên thẻ người nước ngoài.",
    ),
    ("성명(영문)", "Họ và tên viết bằng chữ Latinh, giống như trên hộ chiếu."),
    (
        "생년월일",
        "Ngày tháng năm sinh. Thường ghi theo thứ tự năm.tháng.ngày (ví dụ 1990.01.01).",
    ),
    (
        "외국인등록번호",
        "Số đăng ký người nước ngoài. Là dãy 13 số in trên thẻ người nước ngoài (thẻ cư trú).",
    ),
    ("국적", "Quốc tịch. Ghi tên quốc gia của bạn (ví dụ: 베트남 = Việt Nam)."),
    (
        "체류자격",
        "Tư cách lưu trú (loại visa). Ví dụ F-6 là visa kết hôn. Xem trên thẻ người nước ngoài.",
    ),
    ("주소", "Địa chỉ. Ghi địa chỉ nơi bạn đang sống hiện nay tại Hàn Quốc."),
    ("휴대전화", "Số điện thoại di động để cơ quan liên lạc với bạn."),
    ("연락처", "Thông tin liên lạc, thường là số điện thoại."),
    ("이메일", "Địa chỉ email."),
    ("신청 사유", "Lý do nộp đơn. Viết ngắn gọn vì sao bạn cần nộp đơn này."),
    ("접수번호", "Số tiếp nhận. Cơ quan sẽ ghi vào ô này, bạn không cần viết."),
    (
        "보호자",
        "Người giám hộ. Người chăm sóc và chịu trách nhiệm cho trẻ em (thường là bố hoặc mẹ).",
    ),
    (
        "법정대리인",
        "Người đại diện theo pháp luật. Với trẻ chưa thành niên, thường là bố hoặc mẹ.",
    ),
    ("자녀", "Con (con trai hoặc con gái)."),
    ("자녀와의 관계", "Quan hệ với con. Ví dụ: 부 = bố, 모 = mẹ."),
    ("세대주", "Chủ hộ. Người đứng tên chủ hộ trong sổ đăng ký cư trú."),
    ("가족관계", "Quan hệ gia đình (vợ chồng, con cái, bố mẹ...)."),
    ("배우자", "Vợ hoặc chồng."),
    # ── 서명·날짜 ──
    (
        "서명",
        "Chữ ký. Bạn phải tự ký tay vào giấy thật. Dịch vụ này không ký thay bạn.",
    ),
    (
        "(인)",
        "Chỗ đóng dấu hoặc ký tên. Tự ký tay hoặc đóng con dấu của bạn vào giấy thật.",
    ),
    (
        "(서명 또는 인)",
        "Ký tên hoặc đóng dấu. Tự ký tay hoặc đóng con dấu của bạn vào giấy thật.",
    ),
    ("날인", "Đóng dấu. Đóng con dấu (도장) của bạn vào chỗ này."),
    ("년 월 일", "Năm / tháng / ngày. Ghi ngày theo thứ tự năm, tháng, ngày."),
    # ── 동의서 ──
    ("동의", "Đồng ý."),
    ("동의합니다", "Tôi đồng ý."),
    ("동의하지 않습니다", "Tôi không đồng ý."),
    ("개인정보", "Thông tin cá nhân (tên, ngày sinh, số điện thoại, địa chỉ...)."),
    (
        "개인정보 수집·이용 동의",
        "Đồng ý cho cơ quan thu thập và sử dụng thông tin cá nhân của bạn để xử lý đơn này.",
    ),
    (
        "고유식별정보",
        "Thông tin định danh riêng, ví dụ số đăng ký người nước ngoài hoặc số hộ chiếu.",
    ),
    (
        "제3자 제공",
        "Cung cấp cho bên thứ ba. Cơ quan sẽ chuyển thông tin của bạn cho một cơ quan hoặc tổ chức khác.",
    ),
    (
        "보유 및 이용 기간",
        "Thời gian lưu giữ và sử dụng thông tin. Sau thời gian này thông tin sẽ bị xóa.",
    ),
    (
        "동의를 거부할 권리",
        "Quyền từ chối đồng ý. Bạn có thể không đồng ý, nhưng khi đó có thể không nhận được dịch vụ.",
    ),
]
