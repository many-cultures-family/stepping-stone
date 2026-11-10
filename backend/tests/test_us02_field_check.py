# US-02: 입력 항목 확인과 확정 (FIELD-CHECK-API.md 항목 1·3)
from conftest import insert_draft, insert_form_field

FIELDS_PATH = "/api/drafts/{}/fields"
CONFIRM_PATH = "/api/drafts/{}/fields:confirm"


def get_fields(client, draft_id):
    return client.get(FIELDS_PATH.format(draft_id))


def confirm(client, draft_id):
    return client.post(CONFIRM_PATH.format(draft_id))


# US-02 #1 (정상): 항목명·형식·필수 여부·설명이 모두 표시된다
def test_us02_get_fields_includes_format_label_and_example(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_form_field(
        db,
        draft_id,
        label="보호자 연락처",
        format_code="phone",
        required=1,
        prior_info_key="phone",
        description="보호자 전화번호를 적습니다",
        bbox={"page": 1, "x": 0.1, "y": 0.3, "w": 0.4, "h": 0.04},
    )

    res = get_fields(client, draft_id)

    assert res.status_code == 200
    body = res.json()
    assert body["draft"]["id"] == draft_id
    field = body["fields"][0]
    assert field["label"] == "보호자 연락처"
    assert field["format_label"] == "전화번호"
    assert field["format_example"] == "010-0000-0000"
    assert field["required"] is True
    assert "errors" not in body


# US-02 #3 (실패·거절): 형식이 허용 목록에 없으면 오류가 표시된다
def test_us02_get_fields_reports_format_code_invalid(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    field_id = insert_form_field(db, draft_id, format_code="resident_no", required=1)

    res = get_fields(client, draft_id)

    assert res.status_code == 200
    assert res.json()["errors"] == [
        {"field_id": field_id, "code": "FORMAT_CODE_INVALID"}
    ]


# US-02 #3 (실패·거절): 필수 여부가 비어 있으면 오류가 표시된다
def test_us02_get_fields_reports_required_missing(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    field_id = insert_form_field(db, draft_id, format_code="name", required=None)

    res = get_fields(client, draft_id)

    assert res.json()["errors"] == [{"field_id": field_id, "code": "REQUIRED_MISSING"}]


# 공통 규칙: step이 field_check 이전이면 조회할 수 없다
def test_us02_get_fields_rejects_wrong_step(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "upload")

    res = get_fields(client, draft_id)

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_STEP_INVALID"}}


# 공통 규칙: status가 수정이 아니면(반려 등) 조회할 수 없다
def test_us02_get_fields_rejects_not_editable_status(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "반려", "field_check")

    res = get_fields(client, draft_id)

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_NOT_EDITABLE"}}


def test_us02_get_fields_missing_draft_is_404(client):
    res = get_fields(client, 99999)

    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DRAFT_NOT_FOUND"}}


# US-02 #2 (정상): 모든 항목이 검증을 통과하면 확정되고 항목확정(step=prior_info)으로 바뀐다
def test_us02_confirm_succeeds_when_all_valid(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_form_field(db, draft_id, format_code="name", required=1)

    res = confirm(client, draft_id)

    assert res.status_code == 200
    body = res.json()
    assert body["draft"]["step"] == "prior_info"
    assert body["draft"]["fields_confirmed_at"].endswith("Z")

    row = db.execute(
        "SELECT status, step, fields_confirmed_at FROM draft WHERE id = ?",
        (draft_id,),
    ).fetchone()
    assert row["step"] == "prior_info"
    assert row["fields_confirmed_at"] is not None


# US-02 #3 (실패·거절): 검증 실패 항목이 남아 있으면 확정할 수 없고, 상태는 '수정'에 머문다
# (backlog.md US-02 인수 조건 3번 "상태는 '인식완료'에 머문다" — 아직 팀이 '반려'로
# 바꾸지 않았으므로 이 테스트의 기대값을 따른다. FIELD-CHECK-API.md "아직 정하지 못한 것" 1번)
def test_us02_confirm_fails_and_keeps_status_when_invalid_remains(
    client, db, seed_user_id
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    field_id = insert_form_field(db, draft_id, format_code=None, required=1)

    res = confirm(client, draft_id)

    assert res.status_code == 400
    assert res.json() == {
        "detail": {
            "code": "FIELDS_INVALID",
            "errors": [{"field_id": field_id, "code": "FORMAT_CODE_INVALID"}],
        }
    }

    row = db.execute(
        "SELECT status, step, fields_confirmed_at FROM draft WHERE id = ?",
        (draft_id,),
    ).fetchone()
    assert row["status"] == "수정"
    assert row["step"] == "field_check"
    assert row["fields_confirmed_at"] is None


def test_us02_confirm_missing_draft_is_404(client):
    res = confirm(client, 99999)

    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DRAFT_NOT_FOUND"}}


# F-02 리뷰: 아직 추론하지 않아 항목이 0개인 작성 건은 확정할 수 없다
def test_us02_confirm_rejects_when_no_fields_exist(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")

    res = confirm(client, draft_id)

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "FIELDS_INVALID", "errors": []}}

    row = db.execute("SELECT step FROM draft WHERE id = ?", (draft_id,)).fetchone()
    assert row["step"] == "field_check"


# F-02 리뷰: 허용 목록은 input_format 테이블이 단일 출처다 — 9종 모두 label·example이 채워져야 한다
def test_us02_get_fields_includes_label_example_for_every_allowed_code(
    client, db, seed_user_id
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    for code in ("email", "number", "address", "short_text", "choice"):
        insert_form_field(db, draft_id, format_code=code, required=1)

    res = get_fields(client, draft_id)

    assert res.status_code == 200
    assert "errors" not in res.json()
    for field in res.json()["fields"]:
        assert field["format_label"] is not None
        assert field["format_example"] is not None


def _other_user_id(db):
    other_user_id = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES (?, ?, ?)",
        ("other-sub-0001", "other@example.com", "ko"),
    ).lastrowid
    db.commit()
    return other_user_id


# 권한: 다른 사용자의 작성 건은 조회·확정할 수 없다
def test_us02_get_fields_forbidden_for_other_users_draft(client, db):
    draft_id = insert_draft(db, _other_user_id(db), "수정", "field_check")

    res = get_fields(client, draft_id)

    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}


def test_us02_confirm_forbidden_for_other_users_draft(client, db):
    draft_id = insert_draft(db, _other_user_id(db), "수정", "field_check")

    res = confirm(client, draft_id)

    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}


def test_us02_get_fields_without_login_is_401(anon_client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")

    res = get_fields(anon_client, draft_id)

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}
