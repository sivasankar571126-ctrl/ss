// ============================================================
//  supabase-config.js  –  SALIM SOS
//  Replaces firebase-config.js  —  all other files unchanged.
//
//  SETUP (5 min):
//  1. Go to https://supabase.com → New project → "salim-sos"
//  2. Dashboard → Settings → API → copy URL + anon key below
//  3. Dashboard → Table Editor → New table:
//       Name : emergency_state
//       Columns:
//         id            int8  primary key  default: 1
//         status        text  default: 'SAFE'
//         latitude      float8
//         longitude     float8
//         timestamp     int8
//         patient_name  text  default: 'Salim'
//         patient_phone text  default: '+91 7010733249'
//  4. Insert one row: id=1, status='SAFE'  (seed row)
//  5. Dashboard → Realtime → Enable realtime on "emergency_state" table
//  6. Dashboard → Authentication → Policies → emergency_state:
//       Enable "Enable read access for all users"
//       Enable "Enable insert/update for all users"
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ── ✏️  PASTE YOUR SUPABASE KEYS HERE ────────────────────────
const SUPABASE_URL  = 'https://lioajrzgymewkpfvyztr.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxpb2FqcnpneW1ld2twZnZ5enRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNzU1OTksImV4cCI6MjA5Mjc1MTU5OX0.P1cIquSNu8dd9z4HciHQRMdsTQFdc0X4ULkgVoaSRzo';

// ── Config validation — shows setup screen instead of loading forever ──
export const CONFIG_MISSING = (
  SUPABASE_URL.includes('YOUR_PROJECT_REF') ||
  SUPABASE_ANON.includes('YOUR_SUPABASE_ANON_KEY')
);
export const MISSING_KEYS = [
  ...(SUPABASE_URL.includes('YOUR_PROJECT_REF')    ? ['SUPABASE_URL']  : []),
  ...(SUPABASE_ANON.includes('YOUR_SUPABASE_ANON_KEY') ? ['SUPABASE_ANON'] : []),
];

// ── Safe initialise ────────────────────────────────────────────
let supabase = null;
if (!CONFIG_MISSING) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  } catch (e) {
    console.error('Supabase init failed:', e);
  }
}
export { supabase };

// ── Patient info (hardcoded as specified) ──────────────────────
export const PATIENT = {
  name:  'Salim',
  phone: '+91 7010733249',
};

// ── Guardian whitelist (10 slots) ─────────────────────────────
export const GUARDIANS = [
  { name: 'Guardian 1',  phone: '+91 9787400163' },
  { name: 'Guardian 2',  phone: '+91 9344007335' },
  { name: 'Guardian 3',  phone: '+91 XXXXXXXXXX' },
  { name: 'Guardian 4',  phone: '+91 XXXXXXXXXX' },
  { name: 'Guardian 5',  phone: '+91 XXXXXXXXXX' },
  { name: 'Guardian 6',  phone: '+91 XXXXXXXXXX' },
  { name: 'Guardian 7',  phone: '+91 XXXXXXXXXX' },
  { name: 'Guardian 8',  phone: '+91 XXXXXXXXXX' },
  { name: 'Guardian 9',  phone: '+91 XXXXXXXXXX' },
  { name: 'Guardian 10', phone: '+91 XXXXXXXXXX' },
];

// ── WRITE: Activate emergency ──────────────────────────────────
export async function activateSOS(lat, lng) {
  if (!supabase) throw new Error('Supabase not initialised');
  const { error } = await supabase
    .from('emergency_state')
    .upsert({
      id:            1,                  // single shared row
      status:        'EMERGENCY',
      latitude:      lat,
      longitude:     lng,
      timestamp:     Date.now(),
      patient_name:  PATIENT.name,
      patient_phone: PATIENT.phone,
    }, { onConflict: 'id' });
  if (error) throw error;
}

// ── WRITE: Resolve emergency ───────────────────────────────────
export async function resolveSOS() {
  if (!supabase) throw new Error('Supabase not initialised');
  const { error } = await supabase
    .from('emergency_state')
    .upsert({
      id:        1,
      status:    'SAFE',
      latitude:  null,
      longitude: null,
      timestamp: Date.now(),
    }, { onConflict: 'id' });
  if (error) throw error;
}

// ── READ: Subscribe to real-time changes ───────────────────────
// Returns an unsubscribe function — call it on cleanup.
export function listenSOS(callback) {
  if (!supabase) {
    callback(null);
    return () => {};
  }

  // Fetch current state immediately on subscribe
  supabase
    .from('emergency_state')
    .select('*')
    .eq('id', 1)
    .single()
    .then(({ data, error }) => {
      if (!error && data) callback(normalise(data));
    });

  // Then listen for every INSERT / UPDATE in real time
  const channel = supabase
    .channel('sos-channel')
    .on(
      'postgres_changes',
      {
        event:  '*',              // INSERT + UPDATE + DELETE
        schema: 'public',
        table:  'emergency_state',
        filter: 'id=eq.1',
      },
      (payload) => callback(normalise(payload.new))
    )
    .subscribe();

  // Return cleanup so callers can unsubscribe
  return () => supabase.removeChannel(channel);
}

// ── Internal: map Supabase row → shape App.js expects ─────────
function normalise(row) {
  if (!row) return null;
  return {
    emergency_status: row.status === 'EMERGENCY',
    latitude:         row.latitude,
    longitude:        row.longitude,
    timestamp:        row.timestamp,
    patient: {
      name:  row.patient_name  || PATIENT.name,
      phone: row.patient_phone || PATIENT.phone,
    },
  };
}

/*
  ── Supabase Row-Level Security (RLS) Policies ────────────────
  Run these in Supabase Dashboard → SQL Editor:

  -- Allow everyone to read
  CREATE POLICY "public read"
    ON emergency_state FOR SELECT
    USING (true);

  -- Allow everyone to insert / update
  CREATE POLICY "public write"
    ON emergency_state FOR ALL
    USING (true)
    WITH CHECK (true);

  -- Enable RLS on the table
  ALTER TABLE emergency_state ENABLE ROW LEVEL SECURITY;
*/
