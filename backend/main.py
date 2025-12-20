from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .schemas import SyncRequest
from .database import get_supabase_client

app = FastAPI(title="Dune SQL Logger Backend")

# Allow the extension to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, this should be the specific Extension ID
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def health_check():
    return {"status": "ok", "service": "dune-sql-logger"}

@app.post("/sync")
async def sync_logs(request: SyncRequest):
    supabase = get_supabase_client()
    
    # Convert Pydantic models to dicts
    data_to_insert = [log.model_dump(mode='json') for log in request.logs]
    
    if not data_to_insert:
        return {"status": "success", "count": 0}

    # Concise logging
    log_summary = ", ".join([f"#{l.query_id}({'S' if l.execution_succeeded else 'E'})" for l in request.logs[:5]])
    if len(request.logs) > 5:
        log_summary += f" ... (+{len(request.logs)-5} more)"
    
    print(f"📦 Syncing {len(data_to_insert)} logs: [{log_summary}]")

    try:
        # Use upsert to handle updates
        supabase.table("shared_queries").upsert(data_to_insert).execute()
        return {"status": "success", "count": len(request.logs)}
    except Exception as e:
        print(f"❌ ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
