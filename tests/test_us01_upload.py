import pytest
from conftest import FIXTURES_DIR, count_rows, fetch_one

# API.md 항목 1의 [제안] 값. 개발자1·2 합의로 바뀌면 여기만 고친다.
UPLOAD_PATH = "/api/drafts"
STATUS_CREATED = 201
STATUS_FILE_REQUIRED = 400
STATUS_FILE_TYPE_NOT_ALLOWED = 415
CODE_FILE_REQUIRED = "FILE_REQUIRED"
CODE_FILE_TYPE_NOT_ALLOWED = "FILE_TYPE_NOT_ALLOWED"

# '업로드됨' = status '수정' + step 'upload' (API.md 항목 1 "바뀌는 상태")
EXPECTED_STATUS = "수정"
EXPECTED_STEP = "upload"

# 허용 형식 (API.md 항목 1 실패 응답이 가리키는 DATA-MODEL.md document.mime_type)
ALLOWED_FILES = [
    pytest.param("blank_1page.pdf", "application/pdf", id="pdf"),
    pytest.param("blank_1x1.png", "image/png", id="png"),
    pytest.param("blank_1x1.jpg", "image/jpeg", id="jpg"),
]


def _upload(client, filename, mime_type):
    content = (FIXTURES_DIR / filename).read_bytes()
    return client.post(UPLOAD_PATH, files={"file": (filename, content, mime_type)})


# US-01 #1 (정상): PDF·이미지 파일을 올리면 작성 건이 '업로드됨'으로 생긴다
@pytest.mark.parametrize(("filename", "mime_type"), ALLOWED_FILES)
def test_us01_normal_upload_returns_created_draft(client, filename, mime_type):
    res = _upload(client, filename, mime_type)

    assert res.status_code == STATUS_CREATED
    body = res.json()
    draft = body["draft"]
    assert "id" in draft
    assert draft["status"] == EXPECTED_STATUS
    assert draft["step"] == EXPECTED_STEP
    document = body["document"]
    assert document["mime_type"] == mime_type
    # 이미지의 page_count 값은 미정이라 키만 확인한다
    assert "page_count" in document
    # API.md 공통 규칙: 서버 파일 경로는 응답에 넣지 않는다
    assert "file_path" not in document


# US-01 #1 (정상): 1페이지 PDF의 page_count (API.md 입력·출력 예시)
def test_us01_normal_upload_pdf_page_count(client):
    res = _upload(client, "blank_1page.pdf", "application/pdf")

    assert res.status_code == STATUS_CREATED
    assert res.json()["document"]["page_count"] == 1


# US-01 #1 (정상): 서버가 draft·document 행을 만든다 (API.md 항목 1 출력)
@pytest.mark.parametrize(("filename", "mime_type"), ALLOWED_FILES)
def test_us01_normal_upload_saves_draft_and_document(
    client, db_path, filename, mime_type
):
    drafts_before = count_rows(db_path, "draft")
    documents_before = count_rows(db_path, "document")

    res = _upload(client, filename, mime_type)

    assert res.status_code == STATUS_CREATED
    assert count_rows(db_path, "draft") == drafts_before + 1
    assert count_rows(db_path, "document") == documents_before + 1

    draft_id = res.json()["draft"]["id"]
    draft_row = fetch_one(
        db_path, "SELECT status, step FROM draft WHERE id = ?", (draft_id,)
    )
    assert draft_row == {"status": EXPECTED_STATUS, "step": EXPECTED_STEP}
    document_row = fetch_one(
        db_path, "SELECT mime_type FROM document WHERE draft_id = ?", (draft_id,)
    )
    assert document_row == {"mime_type": mime_type}


# US-01 #1 (실패): 파일이 없으면 작성 건을 만들지 않는다 (API.md 항목 1 실패 응답)
def test_us01_fail_upload_without_file(client, db_path):
    drafts_before = count_rows(db_path, "draft")

    res = client.post(UPLOAD_PATH)

    assert res.status_code == STATUS_FILE_REQUIRED
    assert res.json() == {"detail": {"code": CODE_FILE_REQUIRED}}
    assert count_rows(db_path, "draft") == drafts_before


# US-01 #1 (실패): PDF·이미지가 아니면 작성 건을 만들지 않는다 (API.md 항목 1 실패 응답)
def test_us01_fail_upload_not_allowed_type(client, db_path):
    drafts_before = count_rows(db_path, "draft")

    res = _upload(client, "not_allowed.txt", "text/plain")

    assert res.status_code == STATUS_FILE_TYPE_NOT_ALLOWED
    assert res.json() == {"detail": {"code": CODE_FILE_TYPE_NOT_ALLOWED}}
    assert count_rows(db_path, "draft") == drafts_before
