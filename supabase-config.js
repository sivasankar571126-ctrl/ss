// ============================================================
//  supabase-config.js  –  SALIM SOS
//  ✏️  FILL IN YOUR TWO KEYS BELOW — then push to GitHub
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ── STEP 1: Paste your keys here ──────────────────────────────
//   supabase.com → your project → Settings → API
const SUPABASE_URL  = 'https://lioajrzgymewkpfvyztr.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxpb2FqcnpneW1ld2twZnZ5enRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNzU1OTksImV4cCI6MjA5Mjc1MTU5OX0.P1cIquSNu8dd9z4HciHQRMdsTQFdc0X4ULkgVoaSRzo';

// ── Config check — prevents infinite loading screen ───────────
export const CONFIG_MISSING = (
  SUPABASE_URL.includes('REPLACE_WITH') ||
  SUPABASE_ANON.includes('REPLACE_WITH')
);
export const MISSING_KEYS = [
  ...(SUPABASE_URL.includes('REPLACE_WITH')  ? ['SUPABASE_URL']  : []),
  ...(SUPABASE_ANON.includes('REPLACE_WITH') ? ['SUPABASE_ANON'] : []),
];

// ── Initialise Supabase client ────────────────────────────────
let supabase = null;
if (!CONFIG_MISSING) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  } catch (e) {
    console.error('Supabase init error:', e);
  }
}

// ── Patient info ──────────────────────────────────────────────
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

// ── WRITE: Activate SOS ───────────────────────────────────────
export async function activateSOS(lat, lng) {
  if (!supabase) throw new Error('Supabase not initialised — check your keys');
  const { error } = await supabase
    .from('emergency_state')
    .upsert({
      id:            1,
      status:        'EMERGENCY',
      latitude:      lat,
      longitude:     lng,
      timestamp:     Date.now(),
      patient_name:  PATIENT.name,
      patient_phone: PATIENT.phone,
    }, { onConflict: 'id' });
  if (error) throw error;
}

// ── WRITE: Resolve SOS ────────────────────────────────────────
export async function resolveSOS() {
  if (!supabase) throw new Error('Supabase not initialised — check your keys');
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

// ── READ: Real-time subscription ─────────────────────────────
export function listenSOS(callback) {
  if (!supabase) { callback(null); return () => {}; }

  // Fetch current state immediately
  supabase
    .from('emergency_state')
    .select('*')
    .eq('id', 1)
    .single()
    .then(({ data, error }) => {
      if (!error && data) callback(normalise(data));
    });

  // Subscribe to real-time changes
  const channel = supabase
    .channel('sos-realtime')
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'emergency_state',
      filter: 'id=eq.1',
    }, payload => callback(normalise(payload.new)))
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ── Internal: normalise Supabase row → App.js shape ──────────
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
