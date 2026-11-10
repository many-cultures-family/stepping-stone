# 사전 정보(개인정보) 값 암·복호화. DB에는 암호문만 저장한다 (DATA-MODEL.md prior_info.value,
# 팀 요구사항 "개인정보 암호화 저장"). 대칭키 하나로 서버에서만 암·복호화한다.
import os

from cryptography.fernet import Fernet, InvalidToken


def _fernet():
    # get_db_path와 같은 이유로 호출할 때마다 읽는다 (테스트가 키를 바꿀 수 있게)
    key = os.environ.get("PRIOR_INFO_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("PRIOR_INFO_ENCRYPTION_KEY가 설정되지 않음")
    return Fernet(key.encode())


def encrypt_value(value):
    return _fernet().encrypt(value.encode()).decode()


def decrypt_value(token):
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError(
            "사전 정보 복호화 실패 — PRIOR_INFO_ENCRYPTION_KEY가 바뀌었을 수 있음"
        ) from exc
