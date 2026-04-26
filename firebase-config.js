// ============================================================
//  firebase-config.js  –  SALIM SOS
//  Replace the values below with YOUR Firebase project keys.
//  How to get them:
//   1. Go to https://console.firebase.google.com
//   2. Create project  →  "salim-sos"
//   3. Project Settings → General → Your apps → Add Web App
//   4. Copy the firebaseConfig object and paste here
//   5. Enable Realtime Database (Build → Realtime Database)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://lioajrzgymewkpfvyztr.supabase.co",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ── Initialise ─────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

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

// ── DB helpers ─────────────────────────────────────────────────
const SOS_PATH = "salim_sos/emergency_state";

export function activateSOS(lat, lng) {
  return set(ref(db, SOS_PATH), {
    emergency_status: true,
    patient:  PATIENT,
    latitude:  lat,
    longitude: lng,
    timestamp: Date.now()
  });
}

export function resolveSOS() {
  return set(ref(db, SOS_PATH), {
    emergency_status: false,
    patient:  PATIENT,
    latitude:  null,
    longitude: null,
    timestamp: Date.now()
  });
}

export function listenSOS(callback) {
  onValue(ref(db, SOS_PATH), snap => callback(snap.val()));
}

/*
  ── Firebase Realtime Database Rules ──────────────────────────
  Paste in Firebase Console → Realtime Database → Rules:

  {
    "rules": {
      "salim_sos": {
        "emergency_state": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
*/
