# 사전 정보 조회·저장 (F-03, US-04). [제안] API — docs/api에 F-03 명세가 아직 없다
from conftest import insert_prior_info

from app import crypto

PRIOR_INFO_PATH = "/api/prior-info"


def get_prior_info(client):
    return client.get(PRIOR_INFO_PATH)


def put_prior_info(client, values):
    return client.put(PRIOR_INFO_PATH, json={"values": values})


# 정상: 시드 사용자가 이미 저장해 둔 사전 정보(이름·생년월일·연락처)가 복호화돼 나온다
def test_get_prior_info_returns_seeded_values_decrypted(client):
    res = get_prior_info(client)

    assert res.status_code == 200
    body = res.json()["prior_info"]
    assert body["name"]["value"] == "테스트 사용자"
    assert body["birth_date"]["value"] == "1990.01.01"
    assert body["phone"]["value"] == "010-0000-1234"
    assert body["name"]["format_code"] == "name"
    assert body["name"]["updated_at"].endswith("Z")
    # 주소는 시드에 없다 — 저장 안 된 항목은 null
    assert body["address"]["value"] is None
    assert body["address"]["updated_at"] is None


# 개인정보 암호화 저장: DB 원본 컬럼에는 평문이 남지 않는다
def test_prior_info_value_is_encrypted_at_rest(client, db, seed_user_id):
    row = db.execute(
        "SELECT value FROM prior_info WHERE user_id = ? AND info_key = 'name'",
        (seed_user_id,),
    ).fetchone()

    assert row["value"] != "테스트 사용자"
    assert crypto.decrypt_value(row["value"]) == "테스트 사용자"


# 정상: 저장하면 다음 조회에서 새 값이 복호화돼 나오고 DB에는 암호문만 남는다
def test_put_prior_info_saves_and_encrypts(client, db, seed_user_id):
    res = put_prior_info(client, {"address": "서울특별시 중구 세종대로 110"})

    assert res.status_code == 200
    assert (
        res.json()["prior_info"]["address"]["value"] == "서울특별시 중구 세종대로 110"
    )

    row = db.execute(
        "SELECT value FROM prior_info WHERE user_id = ? AND info_key = 'address'",
        (seed_user_id,),
    ).fetchone()
    assert row["value"] != "서울특별시 중구 세종대로 110"
    assert crypto.decrypt_value(row["value"]) == "서울특별시 중구 세종대로 110"


# 정상: 이미 저장된 값을 고치면 덮어쓴다 (새로 만들지 않음)
def test_put_prior_info_overwrites_existing_value(client, db, seed_user_id):
    res = put_prior_info(client, {"phone": "010-9999-8888"})

    assert res.status_code == 200
    assert res.json()["prior_info"]["phone"]["value"] == "010-9999-8888"
    count = db.execute(
        "SELECT COUNT(*) FROM prior_info WHERE user_id = ? AND info_key = 'phone'",
        (seed_user_id,),
    ).fetchone()[0]
    assert count == 1


# 실패·거절: 형식이 안 맞으면 저장하지 않고 오류를 돌려준다
def test_put_prior_info_rejects_invalid_format(client, db, seed_user_id):
    res = put_prior_info(client, {"phone": "010-123-4567"})

    assert res.status_code == 400
    assert res.json() == {
        "detail": {
            "code": "PRIOR_INFO_INVALID",
            "errors": [{"info_key": "phone", "code": "FORMAT_INVALID"}],
        }
    }
    row = db.execute(
        "SELECT value FROM prior_info WHERE user_id = ? AND info_key = 'phone'",
        (seed_user_id,),
    ).fetchone()
    assert crypto.decrypt_value(row["value"]) == "010-0000-1234"  # 시드 값 그대로


# 실패·거절: 빈 값은 필수 누락으로 거절한다 (빈 값을 저장해 두면 자동 입력이 빈 칸을 채운다)
def test_put_prior_info_rejects_blank_value(client):
    res = put_prior_info(client, {"address": "   "})

    assert res.status_code == 400
    assert res.json()["detail"]["errors"] == [
        {"info_key": "address", "code": "REQUIRED_MISSING"}
    ]


# 실패·거절: 허용되지 않은 info_key는 거절한다
def test_put_prior_info_rejects_unknown_info_key(client):
    res = put_prior_info(client, {"resident_no": "901231-1234567"})

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "INFO_KEY_INVALID"}}


# 실패·거절: 본문이 비어 있으면 거절한다
def test_put_prior_info_rejects_empty_values(client):
    res = put_prior_info(client, {})

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "VALUES_REQUIRED"}}


# 권한: 로그인하지 않으면 조회·저장할 수 없다
def test_get_prior_info_without_login_is_401(anon_client):
    res = get_prior_info(anon_client)

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


def test_put_prior_info_without_login_is_401(anon_client):
    res = put_prior_info(anon_client, {"name": "홍길동"})

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


# 권한: 다른 사용자의 사전 정보는 섞이지 않는다
def test_get_prior_info_is_scoped_to_current_user(client, db):
    other_user_id = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES (?, ?, ?)",
        ("other-sub-0002", "other2@example.com", "ko"),
    ).lastrowid
    db.commit()
    insert_prior_info(db, other_user_id, "name", "name", "다른 사람")

    res = get_prior_info(client)

    assert res.json()["prior_info"]["name"]["value"] == "테스트 사용자"
