-- Create sync history tracking table
CREATE TABLE IF NOT EXISTS sync_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_cards_processed INTEGER DEFAULT 0,
  total_sets_processed INTEGER DEFAULT 0,
  pages_fetched INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sync_history ENABLE ROW LEVEL SECURITY;

-- Allow public read access to sync history
CREATE POLICY "public_read_sync_history" ON sync_history
  FOR SELECT USING (true);

-- Only allow server (service role) to insert/update
CREATE POLICY "server_write_sync_history" ON sync_history
  FOR ALL USING (false);