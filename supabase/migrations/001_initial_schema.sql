-- Nodebook: one graph document per user


CREATE TABLE IF NOT EXISTS graphs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT 'My Graph',
  data       JSONB       NOT NULL DEFAULT '{"nodes":{},"edges":[],"view":{"tx":0,"ty":0,"scale":1}}',
  version    BIGINT      NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the owning user can read or write their graph
ALTER TABLE graphs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_only" ON graphs
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Speeds up real-time subscription filter
CREATE INDEX IF NOT EXISTS graphs_user_id_idx ON graphs(user_id);

-- Grant table-level access to the authenticated role (required alongside RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.graphs TO authenticated;

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER graphs_updated_at
  BEFORE UPDATE ON graphs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
