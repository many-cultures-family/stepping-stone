# US-01 #1: PDF·이미지 파일을 올리면 작성 건이 '업로드됨'(status=수정, step=upload)으로 생긴다
import io

import pytest
from conftest import FIXTURES_DIR, count_rows
from pypdf import PdfWriter

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

# 개인정보 없는 가짜 파일
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 16
TXT_BYTES = "가짜 텍스트 파일".encode()

# 허용 형식별 가짜 입력 파일 (tests/fixtures/)
FIXTURE_FILES = [
    pytest.param("blank_1page.pdf", "application/pdf", id="pdf"),
    pytest.param("blank_1x1.png", "image/png", id="png"),
    pytest.param("blank_1x1.jpg", "image/jpeg", id="jpg"),
]


def make_pdf(pages=1):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def upload(client, name, data, content_type):
    return client.post(UPLOAD_PATH, files={"file": (name, data, content_type)})


def upload_fixture(client, filename, mime_type):
    return upload(client, filename, (FIXTURES_DIR / filename).read_bytes(), mime_type)


def saved_files(upload_dir):
    return list(upload_dir.iterdir()) if upload_dir.exists() else []


# US-01 #1 (정상)
def test_us01_1_t1_pdf_creates_uploaded_draft(client):
    res = upload(client, "sample.pdf", make_pdf(), "application/pdf")

    assert res.status_code == STATUS_CREATED
    body = res.json()
    assert isinstance(body["draft"]["id"], int)
    assert body["draft"]["status"] == EXPECTED_STATUS
    assert body["draft"]["step"] == EXPECTED_STEP
    assert body["document"] == {"mime_type": "application/pdf", "page_count": 1}


# US-01 #1 (정상)
def test_us01_1_t2_png_creates_draft(client):
    res = upload(client, "sample.png", PNG_BYTES, "image/png")

    assert res.status_code == STATUS_CREATED
    # 근거: DATA-MODEL.md document.page_count '이미지는 1'. API.md 반영 전
    assert res.json()["document"] == {"mime_type": "image/png", "page_count": 1}


# US-01 #1 (정상)
def test_us01_1_t3_jpg_creates_draft(client):
    res = upload(client, "sample.jpg", JPG_BYTES, "image/jpeg")

    assert res.status_code == STATUS_CREATED
    # 근거: DATA-MODEL.md document.page_count '이미지는 1'. API.md 반영 전
    assert res.json()["document"] == {"mime_type": "image/jpeg", "page_count": 1}


# US-01 #1 (실패): 파일이 없으면 작성 건을 만들지 않는다
def test_us01_1_t4_no_file_is_rejected_without_rows(client, db, upload_dir):
    before = (count_rows(db, "draft"), count_rows(db, "document"))

    res = client.post(UPLOAD_PATH)

    assert res.status_code == STATUS_FILE_REQUIRED
    assert res.json() == {"detail": {"code": CODE_FILE_REQUIRED}}
    assert (count_rows(db, "draft"), count_rows(db, "document")) == before
    assert saved_files(upload_dir) == []


# US-01 #1 (실패): 파일이 없으면 작성 건을 만들지 않는다
def test_us01_1_t4_text_instead_of_file_is_rejected_without_rows(
    client, db, upload_dir
):
    # file을 파일이 아닌 글자로 보내도 FastAPI 기본 422가 아니라 400
    before = (count_rows(db, "draft"), count_rows(db, "document"))

    res = client.post(UPLOAD_PATH, data={"file": "hello"})

    assert res.status_code == STATUS_FILE_REQUIRED
    assert res.json() == {"detail": {"code": CODE_FILE_REQUIRED}}
    assert (count_rows(db, "draft"), count_rows(db, "document")) == before
    assert saved_files(upload_dir) == []


# US-01 #1 (실패): PDF·이미지가 아니면 작성 건을 만들지 않는다
def test_us01_1_t5_txt_is_rejected_without_rows(client, db, upload_dir):
    before = (count_rows(db, "draft"), count_rows(db, "document"))

    res = upload(client, "note.txt", TXT_BYTES, "text/plain")

    assert res.status_code == STATUS_FILE_TYPE_NOT_ALLOWED
    assert res.json() == {"detail": {"code": CODE_FILE_TYPE_NOT_ALLOWED}}
    assert (count_rows(db, "draft"), count_rows(db, "document")) == before
    assert saved_files(upload_dir) == []


# US-01 #1 (정상): 서버 파일 경로는 응답에 넣지 않는다 (API.md 공통 규칙)
def test_us01_1_t6_response_has_no_file_path(client):
    res = upload(client, "sample.pdf", make_pdf(), "application/pdf")

    assert res.status_code == STATUS_CREATED
    assert "file_path" not in res.json()["document"]
    assert "file_path" not in res.text


# US-01 #1 (정상): 서버가 draft·document 행을 만든다
def test_us01_1_t7_rows_are_saved(client, db):
    res = upload(client, "sample.pdf", make_pdf(), "application/pdf")

    assert res.status_code == STATUS_CREATED
    draft_id = res.json()["draft"]["id"]

    drafts = db.execute("SELECT * FROM draft").fetchall()
    assert len(drafts) == 1
    assert drafts[0]["id"] == draft_id
    assert drafts[0]["status"] == EXPECTED_STATUS
    assert drafts[0]["step"] == EXPECTED_STEP
    # 근거: DATA-MODEL.md reanalysis_count '처음 값은 0'. API.md에는 없음
    assert drafts[0]["reanalysis_count"] == 0

    documents = db.execute(
        "SELECT * FROM document WHERE draft_id = ?", (draft_id,)
    ).fetchall()
    assert len(documents) == 1
    assert documents[0]["mime_type"] == "application/pdf"
    assert documents[0]["page_count"] == 1


# US-01 #1 (정상): 형식마다 draft·document 행이 1개씩 생긴다
@pytest.mark.parametrize(("filename", "mime_type"), FIXTURE_FILES)
def test_us01_1_t8_rows_are_saved_per_type(client, db, filename, mime_type):
    drafts_before = count_rows(db, "draft")
    documents_before = count_rows(db, "document")

    res = upload_fixture(client, filename, mime_type)

    assert res.status_code == STATUS_CREATED
    assert count_rows(db, "draft") == drafts_before + 1
    assert count_rows(db, "document") == documents_before + 1

    draft_id = res.json()["draft"]["id"]
    draft_row = db.execute(
        "SELECT status, step FROM draft WHERE id = ?", (draft_id,)
    ).fetchone()
    assert dict(draft_row) == {"status": EXPECTED_STATUS, "step": EXPECTED_STEP}
    document_row = db.execute(
        "SELECT mime_type FROM document WHERE draft_id = ?", (draft_id,)
    ).fetchone()
    assert dict(document_row) == {"mime_type": mime_type}
    # 이미지의 page_count 값은 미정이라 응답에 키가 있는지만 확인한다
    assert "page_count" in res.json()["document"]


# US-01 #1 (정상): 서버는 올린 파일을 저장한다 (API.md 항목 1 출력)
@pytest.mark.parametrize(("filename", "mime_type"), FIXTURE_FILES)
def test_us01_1_t9_file_is_saved_once(client, upload_dir, filename, mime_type):
    before = len(saved_files(upload_dir))

    res = upload_fixture(client, filename, mime_type)

    assert res.status_code == STATUS_CREATED
    assert len(saved_files(upload_dir)) == before + 1


# US-01 #1 (실패): 앞부분만 PDF이고 읽을 수 없는 파일
# API.md에 없는 경우(손상 PDF). 구현 쪽 결정이며 API.md 합의 전
def test_us01_1_broken_pdf_is_rejected_without_rows(client, db, upload_dir):
    # 앞부분만 PDF이고 읽을 수 없는 파일은 PDF가 아니므로 415
    before = (count_rows(db, "draft"), count_rows(db, "document"))

    res = upload(client, "broken.pdf", b"%PDF-1.4 broken", "application/pdf")

    assert res.status_code == STATUS_FILE_TYPE_NOT_ALLOWED
    assert res.json() == {"detail": {"code": CODE_FILE_TYPE_NOT_ALLOWED}}
    assert (count_rows(db, "draft"), count_rows(db, "document")) == before
    assert saved_files(upload_dir) == []


# US-01 #1 (정상): 여러 페이지 PDF
def test_us01_1_multi_page_pdf_counts_pages(client):
    res = upload(client, "sample.pdf", make_pdf(pages=3), "application/pdf")

    assert res.status_code == STATUS_CREATED
    assert res.json()["document"] == {"mime_type": "application/pdf", "page_count": 3}
