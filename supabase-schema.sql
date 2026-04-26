-- ================================================================
--  SALIM SOS  --  Supabase Database Schema
--  HOW TO USE:
--  1. Open Supabase Dashboard → SQL Editor
--  2. Click "New Query"
--  3. Paste this entire file → Click "Run"
--  4. You should see "Success. No rows returned"
-- ================================================================


-- STEP 1: Create the emergency_state table
CREATE TABLE IF NOT EXISTS emergency_state (
  id            BIGINT PRIMARY KEY DEFAULT 1,
  status        TEXT    NOT NULL DEFAULT 'SAFE',
  latitude      FLOAT8,
  longitude     FLOAT8,
  timestamp     BIGINT,
  patient_name  TEXT    DEFAULT 'Salim',
  patient_phone TEXT    DEFAULT '+91 7010733249',
  activated_at  TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- STEP 2: Insert the one seed row (id = 1)
INSERT INTO emergency_state (id, status, patient_name, patient_phone)
VALUES (1, 'SAFE', 'Salim', '+91 7010733249')
ON CONFLICT (id) DO NOTHING;


-- STEP 3: Enable Row Level Security
ALTER TABLE emergency_state ENABLE ROW LEVEL SECURITY;


-- STEP 4: Allow everyone to READ
CREATE POLICY "public_read"
  ON emergency_state
  FOR SELECT
  USING (true);


-- STEP 5: Allow everyone to INSERT
CREATE POLICY "public_insert"
  ON emergency_state
  FOR INSERT
  WITH CHECK (true);


-- STEP 6: Allow everyone to UPDATE
CREATE POLICY "public_update"
  ON emergency_state
  FOR UPDATE
  USING (true)
  WITH CHECK (true);


-- STEP 7: Enable Realtime on the table
ALTER PUBLICATION supabase_realtime ADD TABLE emergency_state;


-- STEP 8: Verify -- you should see 1 row with status = 'SAFE'
SELECT * FROM emergency_state;
