from fastapi import FastAPI

app = FastAPI(title="디딤돌")


@app.get("/api/health")
def health():
    return {"status": "ok"}
