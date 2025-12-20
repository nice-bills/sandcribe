import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_KEY", "")

def get_supabase_client() -> Client:
    if not url or not key:
        print("Warning: SUPABASE_URL or SUPABASE_KEY not set in environment")
    return create_client(url, key)
