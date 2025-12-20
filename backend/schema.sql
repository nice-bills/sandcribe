-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS shared_queries (
    id UUID PRIMARY KEY, -- Client-generated UUID
    session_id TEXT,     -- Session ID
    
    -- Query Info
    query_id BIGINT,
    query_name TEXT,
    query_text TEXT,
    user_intent TEXT,
    
    -- Execution Info
    execution_id TEXT,
    execution_succeeded BOOLEAN,
    runtime_seconds INTEGER,
    
    -- Error Info
    error_message TEXT,
    error_type TEXT,
    error_line INTEGER,
    error_column INTEGER,
    
    -- Fix Info
    has_fix BOOLEAN DEFAULT FALSE,
    fix_execution_id TEXT,
    fixed_query TEXT,
    
    -- Metadata
    training_pair_type TEXT,
    
    -- Timestamps
    timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optional: Index on execution_id for faster lookups if needed
CREATE INDEX IF NOT EXISTS idx_shared_queries_execution_id ON shared_queries(execution_id);
