-- Folders / projects for organizing graphs
CREATE TABLE IF NOT EXISTS folders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL DEFAULT 'New Folder',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON folders
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS folders_user_id_idx ON folders(user_id);

-- Allow multiple graphs per user, each optionally inside a folder
ALTER TABLE graphs ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
