# input_format은 R2 허용 목록의 단일 출처다 (F-02 리뷰 — 허용 목록이 코드 상수와
# DB에 각각 있으면 어긋난다). 9종이 모두 채워져 있는지 고정해 둔다.
ALLOWED_FORMAT_CODES = {
    "phone",
    "date",
    "email",
    "number",
    "name",
    "address",
    "short_text",
    "long_text",
    "choice",
}


def test_input_format_seed_covers_all_allowed_codes(db):
    rows = db.execute("SELECT code, label, example FROM input_format").fetchall()
    codes = {row["code"] for row in rows}

    assert codes == ALLOWED_FORMAT_CODES
    for row in rows:
        assert row["label"]
        assert row["example"]
