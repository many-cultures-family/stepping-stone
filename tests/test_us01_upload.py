# US-01 #1: PDF·이미지 파일을 올리면 작성 건이 '업로드됨'(status=수정, step=upload)으로 생긴다
import io

from conftest import count_rows
from pypdf import PdfWriter

# 개인정보 없는 가짜 파일
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 16
TXT_BYTES = "가짜 텍스트 파일".encode()


def make_pdf(pages=1):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def upload(client, name, data, content_type):
    return client.post("/api/drafts", files={"file": (name, data, content_type)})


def saved_files(upload_dir):
    return list(upload_dir.iterdir()) if upload_dir.exists() else []


def test_us01_1_t1_pdf_creates_uploaded_draft(client):
    res = upload(client, "sample.pdf", make_pdf(), "application/pdf")

    assert res.status_code == 201
    body = res.json()
    assert isinstance(body["draft"]["id"], int)
    assert body["draft"]["status"] == "수정"
    assert body["draft"]["step"] == "upload"
    assert body["document"] == {"mime_type": "application/pdf", "page_count": 1}


def test_us01_1_t2_png_creates_draft(client):
    res = upload(client, "sample.png", PNG_BYTES, "image/png")

    assert res.status_code == 201
    assert res.json()["document"] == {"mime_type": "image/png", "page_count": 1}


def test_us01_1_t3_jpg_creates_draft(client):
    res = upload(client, "sample.jpg", JPG_BYTES, "image/jpeg")

    assert res.status_code == 201
    assert res.json()["document"] == {"mime_type": "image/jpeg", "page_count": 1}


def test_us01_1_t4_no_file_is_rejected_without_rows(client, db, upload_dir):
    before = (count_rows(db, "draft"), count_rows(db, "document"))

    res = client.post("/api/drafts")

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "FILE_REQUIRED"}}
    assert (count_rows(db, "draft"), count_rows(db, "document")) == before
    assert saved_files(upload_dir) == []


def test_us01_1_t4_text_instead_of_file_is_rejected_without_rows(
    client, db, upload_dir
):
    # file을 파일이 아닌 글자로 보내도 FastAPI 기본 422가 아니라 400
    before = (count_rows(db, "draft"), count_rows(db, "document"))

    res = client.post("/api/drafts", data={"file": "hello"})

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "FILE_REQUIRED"}}
    assert (count_rows(db, "draft"), count_rows(db, "document")) == before
    assert saved_files(upload_dir) == []


def test_us01_1_t5_txt_is_rejected_without_rows(client, db, upload_dir):
    before = (count_rows(db, "draft"), count_rows(db, "document"))

    res = upload(client, "note.txt", TXT_BYTES, "text/plain")

    assert res.status_code == 415
    assert res.json() == {"detail": {"code": "FILE_TYPE_NOT_ALLOWED"}}
    assert (count_rows(db, "draft"), count_rows(db, "document")) == before
    assert saved_files(upload_dir) == []


def test_us01_1_t6_response_has_no_file_path(client):
    res = upload(client, "sample.pdf", make_pdf(), "application/pdf")

    assert res.status_code == 201
    assert "file_path" not in res.json()["document"]
    assert "file_path" not in res.text


def test_us01_1_t7_rows_are_saved(client, db):
    res = upload(client, "sample.pdf", make_pdf(), "application/pdf")
    draft_id = res.json()["draft"]["id"]

    drafts = db.execute("SELECT * FROM draft").fetchall()
    assert len(drafts) == 1
    assert drafts[0]["id"] == draft_id
    assert drafts[0]["status"] == "수정"
    assert drafts[0]["step"] == "upload"
    assert drafts[0]["reanalysis_count"] == 0

    documents = db.execute(
        "SELECT * FROM document WHERE draft_id = ?", (draft_id,)
    ).fetchall()
    assert len(documents) == 1
    assert documents[0]["mime_type"] == "application/pdf"
    assert documents[0]["page_count"] == 1


def test_us01_1_broken_pdf_is_rejected_without_rows(client, db, upload_dir):
    # 앞부분만 PDF이고 읽을 수 없는 파일은 PDF가 아니므로 415
    before = (count_rows(db, "draft"), count_rows(db, "document"))

    res = upload(client, "broken.pdf", b"%PDF-1.4 broken", "application/pdf")

    assert res.status_code == 415
    assert res.json() == {"detail": {"code": "FILE_TYPE_NOT_ALLOWED"}}
    assert (count_rows(db, "draft"), count_rows(db, "document")) == before
    assert saved_files(upload_dir) == []


def test_us01_1_multi_page_pdf_counts_pages(client):
    res = upload(client, "sample.pdf", make_pdf(pages=3), "application/pdf")

    assert res.status_code == 201
    assert res.json()["document"] == {"mime_type": "application/pdf", "page_count": 3}
