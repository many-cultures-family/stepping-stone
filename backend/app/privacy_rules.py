"""감지 규칙 목록 API (REVIEW-PRIVACY-API.md 항목 4, F-07 / US-05).

브라우저 감지(①)와 서버 재검사(⑤)가 같은 규칙을 쓰도록, 서버 마스킹 모듈의
값 모양 규칙(`privacy._PATTERNS`)을 그대로 내려 준다 (l3-masking.md 2절 '규칙 한 벌').
라벨 규칙은 OCR 문서용이라 넣지 않는다.

확인 필요: Python 정규식이 JavaScript에서 똑같이 동작하는지 (l3-masking.md 9절 #4)
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app import auth, privacy

router = APIRouter(prefix="/api")


@router.get("/privacy-rules")
def get_privacy_rules(user: Annotated[dict, Depends(auth.current_user)]):
    return {
        "rules": [
            {"kind": kind, "pattern": pattern.pattern}
            for kind, pattern in privacy._PATTERNS
        ]
    }
