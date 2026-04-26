// ============================================================
//  firebase-config.js  –  SALIM SOS  (FIXED)
//  Paste YOUR Firebase keys below — all 7 fields required.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── ✏️  PASTE YOUR FIREBASE CONFIG HERE ──────────────────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ── Config validation — shows setup screen instead of infinite load ──
const MISSING_FIELDS = Object.entries(firebaseConfig)
  .filter(([k, v]) => v.startsWith("YOUR_"))
  .map(([k]) => k);

export const CONFIG_MISSING = MISSING_FIELDS.length > 0;
export const MISSING_KEYS   = MISSING_FIELDS;

// ── Safe init — never throws to the caller ────────────────────
let db = null;
if (!CONFIG_MISSING) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
  } catch (e) {
    console.error("Firebase init failed:", e);
  }
}
export { db };

// ── Patient & Guardian info ────────────────────────────────────
export const PATIENT = {
  name:  "Salim",
  phone: "+91 7010733249"
};

export const GUARDIANS = [
  { name: "Guardian 1",  phone: "+91 9787400163" },
  { name: "Guardian 2",  phone: "+91 9344007335" },
  { name: "Guardian 3",  phone: "+91 XXXXXXXXXX" },
  { name: "Guardian 4",  phone: "+91 XXXXXXXXXX" },
  { name: "Guardian 5",  phone: "+91 XXXXXXXXXX" },
  { name: "Guardian 6",  phone: "+91 XXXXXXXXXX" },
  { name: "Guardian 7",  phone: "+91 XXXXXXXXXX" },
  { name: "Guardian 8",  phone: "+91 XXXXXXXXXX" },
  { name: "Guardian 9",  phone: "+91 XXXXXXXXXX" },
  { name: "Guardian 10", phone: "+91 XXXXXXXXXX" }
];

const SOS_PATH = "salim_sos/emergency_state";

export function activateSOS(lat, lng) {
  if (!db) return Promise.reject(new Error("Firebase not initialised"));
  return set(ref(db, SOS_PATH), {
    emergency_status: true,
    patient:  PATIENT,
    latitude:  lat,
    longitude: lng,
    timestamp: Date.now()
  });
}

export function resolveSOS() {
  if (!db) return Promise.reject(new Error("Firebase not initialised"));
  return set(ref(db, SOS_PATH), {
    emergency_status: false,
    patient:  PATIENT,
    latitude:  null,
    longitude: null,
    timestamp: Date.now()
  });
}

export function listenSOS(callback) {
  if (!db) { callback(null); return () => {}; }
  onValue(ref(db, SOS_PATH), snap => callback(snap.val()));
  return () => {};
}
