// ============================================================
//  App.js  –  SALIM SOS  (Supabase Edition — fully fixed)
// ============================================================

import {
  PATIENT,
  GUARDIANS,
  activateSOS,
  resolveSOS,
  listenSOS,
  CONFIG_MISSING,
  MISSING_KEYS,
} from './supabase-config.js';

// ── State ──────────────────────────────────────────────────────
let emergencyState = null;
let sirenPlaying   = false;
let muted          = false;
let timerInterval  = null;
let elapsed        = 0;
let myCoords       = null;
let map            = null;
let salimMarker    = null;
let guardianMarker = null;
let routeLine      = null;
let audioCtx       = null;
let oscNode        = null;
let gainNode       = null;
let gpsWatchId     = null;

const app = document.getElementById('app');

// ── Helpers ────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function fmtDist(m) {
  if (!m || isNaN(m)) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}
function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}
function watchGPS(cb) {
  if (!('geolocation' in navigator)) return null;
  return navigator.geolocation.watchPosition(
    p => cb({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
    e => console.warn('GPS:', e.message),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// ── Siren ──────────────────────────────────────────────────────
function startSiren() {
  if (sirenPlaying) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    oscNode  = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.75;
    oscNode.type = 'sawtooth';
    oscNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscNode.start();
    const sweep = () => {
      if (!oscNode) return;
      oscNode.frequency.linearRampToValueAtTime(1100, audioCtx.currentTime + 0.4);
      oscNode.frequency.linearRampToValueAtTime(600,  audioCtx.currentTime + 0.8);
      setTimeout(sweep, 800);
    };
    oscNode.frequency.setValueAtTime(600, audioCtx.currentTime);
    sweep();
    sirenPlaying = true;
  } catch (e) { console.error('Siren error:', e); }
}
function stopSiren() {
  try {
    if (oscNode)  { oscNode.stop();        oscNode  = null; }
    if (gainNode) { gainNode.disconnect(); gainNode = null; }
    if (audioCtx) { audioCtx.close();     audioCtx = null; }
  } catch (_) {}
  sirenPlaying = false;
}

// ── Map ────────────────────────────────────────────────────────
function initMap(lat, lng) {
  if (map || !window.L) return;
  map = L.map('map', { attributionControl: false }).setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map);
}
const mkRed  = () => window.L && L.divIcon({ html: `<div style="width:20px;height:20px;border-radius:50%;background:#FF1C1C;border:3px solid #fff;box-shadow:0 0 14px rgba(255,28,28,.8)"></div>`, iconSize:[20,20], iconAnchor:[10,10], className:'' });
const mkBlue = () => window.L && L.divIcon({ html: `<div style="width:16px;height:16px;border-radius:50%;background:#4FC3F7;border:3px solid #fff;box-shadow:0 0 10px rgba(79,195,247,.8)"></div>`, iconSize:[16,16], iconAnchor:[8,8], className:'' });

function updateMap(sLat, sLng, mLat, mLng) {
  if (!window.L || !map) return;
  try {
    if (!salimMarker) salimMarker = L.marker([sLat, sLng], { icon: mkRed()  }).addTo(map).bindPopup(`<b style="color:#FF1C1C">🆘 ${PATIENT.name}</b>`);
    else salimMarker.setLatLng([sLat, sLng]);
    if (mLat && mLng) {
      if (!guardianMarker) guardianMarker = L.marker([mLat, mLng], { icon: mkBlue() }).addTo(map).bindPopup('<b style="color:#4FC3F7">📍 You</b>');
      else guardianMarker.setLatLng([mLat, mLng]);
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline([[sLat,sLng],[mLat,mLng]], { color:'#FF3333', weight:4, dashArray:'10 6' }).addTo(map);
      map.fitBounds([[sLat,sLng],[mLat,mLng]], { padding:[40,40] });
      const db = document.getElementById('dist-badge');
      if (db) db.textContent = `📏 Distance: ${fmtDist(haversine(sLat, sLng, mLat, mLng))}`;
    } else {
      map.setView([sLat, sLng], 15);
    }
  } catch (e) { console.error('Map error:', e); }
}

// ══════════════════════════════════════════════════════════════
//  SETUP SCREEN — shown when Supabase keys are missing
// ══════════════════════════════════════════════════════════════
function renderSetupScreen() {
  app.innerHTML = `
    <div class="grid-bg"></div>
    <div class="role-selector">
      <div class="sos-logo">
        <span class="s1">S</span><span class="o">O</span><span class="s2">S</span>
      </div>
      <h1 class="app-title">SALIM SOS</h1>
      <p class="app-subtitle" style="color:#FFB800">⚠ SUPABASE SETUP REQUIRED</p>
      <div class="divider" style="background:linear-gradient(90deg,transparent,#FFB800,transparent)"></div>
      <div style="
        background:rgba(255,184,0,0.08);border:1px solid rgba(255,184,0,0.35);
        border-radius:10px;padding:20px 22px;width:100%;
        font-family:'Share Tech Mono',monospace;font-size:0.82rem;
        line-height:1.8;color:rgba(255,255,255,0.75);
      ">
        <div style="color:#FFB800;font-size:0.9rem;margin-bottom:10px;letter-spacing:0.1em">
          KEYS MISSING IN supabase-config.js
        </div>
        ${MISSING_KEYS.map(k => `<span style="color:#FF6666">✗ ${k}</span><br>`).join('')}
        <br>
        <span style="color:#00FF87">HOW TO FIX:</span><br>
        1. Open <b>src/supabase-config.js</b><br>
        2. Paste your Project URL and anon key<br>
        3. git add . → git commit → git push<br><br>
        <span style="color:rgba(255,255,255,0.35);font-size:0.7rem">
          Get keys: supabase.com → Project → Settings → API
        </span>
      </div>
      <a href="https://supabase.com/dashboard" target="_blank" style="
        display:block;text-align:center;text-decoration:none;
        background:rgba(255,184,0,0.1);border:1px solid rgba(255,184,0,0.4);
        color:#FFB800;font-family:'Share Tech Mono',monospace;
        font-size:0.8rem;letter-spacing:0.1em;padding:12px;border-radius:8px;width:100%;
      ">🔑 OPEN SUPABASE DASHBOARD →</a>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  ROLE SELECTOR
// ══════════════════════════════════════════════════════════════
function renderRoleSelector() {
  if (gpsWatchId) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
  stopSiren(); clearInterval(timerInterval); elapsed = 0;
  document.body.classList.remove('emergency-active');

  app.innerHTML = `
    <div class="grid-bg"></div>
    <div class="role-selector">
      <div class="sos-logo">
        <span class="s1">S</span><span class="o">O</span><span class="s2">S</span>
      </div>
      <h1 class="app-title">SALIM SOS</h1>
      <p class="app-subtitle">EMERGENCY RESPONSE SYSTEM</p>
      <div class="divider"></div>
      <p class="role-desc">Select your role to continue.</p>
      <div class="role-cards">
        <button class="role-card sender" id="btn-sender">
          <div class="card-icon">🆘</div>
          <div class="card-role">PATIENT</div>
          <div class="card-name">SALIM</div>
          <div class="card-desc">Activate emergency broadcast to all guardians.</div>
          <div class="card-phone">${PATIENT.phone}</div>
          <div class="card-enter">→ ENTER</div>
        </button>
        <button class="role-card guardian" id="btn-guardian">
          <div class="card-icon">🛡</div>
          <div class="card-role">GUARDIAN</div>
          <div class="card-name">MONITOR</div>
          <div class="card-desc">Receive alerts &amp; track Salim live.</div>
          <div class="card-phone">Stay alert. Stay ready.</div>
          <div class="card-enter">→ ENTER</div>
        </button>
      </div>
      <div class="sys-status">
        <span class="dot dot-green"></span>
        SYSTEM ONLINE · SUPABASE CONNECTED
      </div>
    </div>`;
  document.getElementById('btn-sender').addEventListener('click', renderSenderView);
  document.getElementById('btn-guardian').addEventListener('click', renderGuardianView);
}

// ══════════════════════════════════════════════════════════════
//  SENDER VIEW
// ══════════════════════════════════════════════════════════════
function renderSenderView() {
  function draw() {
    const isEmergency = emergencyState?.emergency_status === true;
    if (isEmergency) document.body.classList.add('emergency-active');
    else             document.body.classList.remove('emergency-active');

    app.innerHTML = `
      ${isEmergency ? '<div class="scanline"></div>' : ''}
      <div class="grid-bg"></div>
      <div class="sender-view">
        <button class="back-btn" id="back-btn">← BACK</button>
        <div class="patient-badge">
          <span style="font-size:1.5rem">👤</span>
          <div>
            <div class="badge-name">${PATIENT.name}</div>
            <div class="badge-phone">${PATIENT.phone}</div>
          </div>
        </div>
        <div class="gps-bar">
          <span class="dot dot-yellow" id="gps-dot"></span>
          <span id="gps-text">ACQUIRING GPS…</span>
        </div>
        ${isEmergency ? `
          <div class="live-panel">
            <div class="live-head">⚠ EMERGENCY ACTIVE</div>
            <div class="live-timer" id="live-timer">00:00</div>
            <div class="live-stat">📡 Broadcasting to ${GUARDIANS.length} guardians</div>
            <div class="live-stat" id="live-coords">📍 ${
              emergencyState.latitude
                ? `${Number(emergencyState.latitude).toFixed(6)}, ${Number(emergencyState.longitude).toFixed(6)}`
                : 'Locating…'
            }</div>
          </div>
          <div class="coords-card">
            <div class="coord-row"><span class="coord-lbl">LATITUDE</span><span class="coord-val" id="c-lat">${Number(emergencyState.latitude||0).toFixed(7)}</span></div>
            <div class="coord-row"><span class="coord-lbl">LONGITUDE</span><span class="coord-val" id="c-lng">${Number(emergencyState.longitude||0).toFixed(7)}</span></div>
          </div>
          <button class="resolve-btn" id="resolve-btn">✓ MARK AS SAFE / RESOLVED</button>
        ` : `
          <div class="sos-button-wrap">
            <button class="sos-btn" id="sos-btn">
              <span class="ring"></span><span class="ring ring2"></span>
              <div class="btn-inner">
                <span class="btn-icon">🆘</span>
                <span class="btn-label">ACTIVATE</span>
                <span class="btn-sub">EMERGENCY SOS</span>
              </div>
            </button>
          </div>
          <p class="sender-hint">Press only in a real emergency.<br>All ${GUARDIANS.length} guardians alerted instantly.</p>
        `}
      </div>`;

    document.getElementById('back-btn').addEventListener('click', () => {
      if (gpsWatchId) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
      clearInterval(timerInterval); elapsed = 0;
      document.body.classList.remove('emergency-active');
      renderRoleSelector();
    });

    if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = watchGPS(coords => {
      myCoords = coords;
      const dot = document.getElementById('gps-dot');
      const txt = document.getElementById('gps-text');
      if (dot) dot.className = 'dot dot-green';
      if (txt) txt.textContent = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}  ±${Math.round(coords.acc)}m`;
      if (document.getElementById('c-lat')) {
        document.getElementById('c-lat').textContent = coords.lat.toFixed(7);
        document.getElementById('c-lng').textContent = coords.lng.toFixed(7);
        const lc = document.getElementById('live-coords');
        if (lc) lc.textContent = `📍 ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
      }
    });

    if (!isEmergency) {
      document.getElementById('sos-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('sos-btn');
        if (btn) { btn.disabled = true; btn.querySelector('.btn-label').textContent = 'ACTIVATING…'; }
        try {
          await activateSOS(myCoords?.lat || 0, myCoords?.lng || 0);
          elapsed = 0;
          clearInterval(timerInterval);
          timerInterval = setInterval(() => { elapsed++; const t = document.getElementById('live-timer'); if (t) t.textContent = fmtTime(elapsed); }, 1000);
        } catch (e) {
          console.error(e);
          alert('❌ Failed to activate. Check Supabase keys & internet.');
          if (btn) btn.disabled = false;
        }
      });
    } else {
      clearInterval(timerInterval);
      timerInterval = setInterval(() => { elapsed++; const t = document.getElementById('live-timer'); if (t) t.textContent = fmtTime(elapsed); }, 1000);
      document.getElementById('resolve-btn')?.addEventListener('click', async () => {
        if (!confirm('Mark emergency as RESOLVED?')) return;
        try {
          await resolveSOS();
          clearInterval(timerInterval); elapsed = 0;
          document.body.classList.remove('emergency-active');
        } catch (e) { alert('❌ Failed to resolve. Try again.'); }
      });
    }
  }

  listenSOS(data => { emergencyState = data; draw(); });
  draw();
}

// ══════════════════════════════════════════════════════════════
//  GUARDIAN VIEW
// ══════════════════════════════════════════════════════════════
function renderGuardianView() {
  muted = false;
  let alertTime = null;
  map = null; salimMarker = null; guardianMarker = null; routeLine = null;

  function draw() {
    const isEmergency = emergencyState?.emergency_status === true;

    if (isEmergency) {
      if (!muted) startSiren();
      document.body.classList.add('emergency-active');
      if (!alertTime) { alertTime = Date.now(); elapsed = 0; }
    } else {
      stopSiren();
      document.body.classList.remove('emergency-active');
      alertTime = null; elapsed = 0;
      clearInterval(timerInterval);
    }

    app.innerHTML = `
      ${isEmergency ? '<div class="scanline"></div>' : ''}
      <div class="grid-bg"></div>
      <div class="guardian-view">
        <button class="back-btn" id="back-btn">← BACK</button>
        ${isEmergency ? `
          <div class="emergency-header">
            <span class="alert-lbl">⚠ EMERGENCY ALERT</span>
            <span class="alert-timer" id="g-timer">00:00</span>
          </div>
          <div class="alert-card">
            <div class="alert-name">${PATIENT.name.toUpperCase()}</div>
            <div class="alert-phone">${PATIENT.phone}</div>
            <div class="alert-urgent">URGENT ACTION REQUIRED</div>
          </div>
          <div class="coords-card">
            <div class="coord-row"><span class="coord-lbl">LATITUDE</span><span class="coord-val">${Number(emergencyState.latitude||0).toFixed(7)}</span></div>
            <div class="coord-row"><span class="coord-lbl">LONGITUDE</span><span class="coord-val">${Number(emergencyState.longitude||0).toFixed(7)}</span></div>
          </div>
          <div id="map"></div>
          <p class="dist-badge" id="dist-badge">📏 Calculating distance…</p>
          <div class="action-btns">
            <button class="act-btn ${muted ? 'btn-muted' : 'btn-mute'}" id="mute-btn">
              ${muted ? '🔊 UNMUTE SIREN' : '🔇 MUTE / ACKNOWLEDGE'}
            </button>
            <a class="act-btn btn-call" href="tel:${PATIENT.phone.replace(/\s/g,'')}">📞 CALL ${PATIENT.name.toUpperCase()}</a>
          </div>
          ${muted ? '<div class="muted-notice">🔇 SIREN MUTED LOCALLY · EMERGENCY STILL ACTIVE</div>' : ''}
          <p class="ts-bar">ALERT RECEIVED: ${alertTime ? new Date(alertTime).toLocaleTimeString('en-IN',{hour12:true}) : '—'}</p>
        ` : `
          <div class="standby-icon">🛡</div>
          <div class="standby-title">GUARDIAN ACTIVE</div>
          <div class="standby-sub">Monitoring ${PATIENT.name} · ${PATIENT.phone}</div>
          <div class="status-pill">
            <span class="dot dot-green"></span>
            ${emergencyState?.emergency_status === false ? 'ALL CLEAR — SAFE' : 'MONITORING · NO EMERGENCY'}
          </div>
          <div class="guardian-list-box">
            <div class="gl-title">GUARDIAN NETWORK (${GUARDIANS.length}/10)</div>
            ${GUARDIANS.map(g => `<div class="gl-item"><span class="gl-dot"></span>${g.name} · ${g.phone}</div>`).join('')}
          </div>
          <p class="sender-hint">Keep this tab open. Alerts fire automatically.</p>
        `}
      </div>`;

    document.getElementById('back-btn').addEventListener('click', () => {
      if (gpsWatchId) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
      stopSiren(); clearInterval(timerInterval); elapsed = 0;
      document.body.classList.remove('emergency-active');
      renderRoleSelector();
    });

    document.getElementById('mute-btn')?.addEventListener('click', () => {
      muted = !muted;
      muted ? stopSiren() : startSiren();
      draw();
    });

    if (isEmergency && emergencyState.latitude) {
      const sLat = Number(emergencyState.latitude);
      const sLng = Number(emergencyState.longitude);
      if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = watchGPS(coords => { myCoords = coords; updateMap(sLat, sLng, coords.lat, coords.lng); });
      setTimeout(() => {
        try { initMap(sLat, sLng); updateMap(sLat, sLng, myCoords?.lat, myCoords?.lng); if (map) map.invalidateSize(); }
        catch (e) { console.error('Map init:', e); }
      }, 150);
      clearInterval(timerInterval);
      timerInterval = setInterval(() => { elapsed++; const t = document.getElementById('g-timer'); if (t) t.textContent = fmtTime(elapsed); }, 1000);
    }
  }

  listenSOS(data => {
    emergencyState = data;
    map = null; salimMarker = null; guardianMarker = null; routeLine = null;
    draw();
  });
  draw();
}

// ══════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════
function boot() {
  try {
    if (CONFIG_MISSING) { renderSetupScreen(); return; }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW:', e));
    }
    const role = new URLSearchParams(window.location.search).get('role');
    if      (role === 'sender')   renderSenderView();
    else if (role === 'guardian') renderGuardianView();
    else                          renderRoleSelector();
  } catch (err) {
    console.error('Boot failed:', err);
    app.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
        min-height:100vh;gap:16px;padding:24px;text-align:center;font-family:'Share Tech Mono',monospace;">
        <div style="font-size:3rem">⚠</div>
        <div style="color:#FF3333;font-size:1.1rem;letter-spacing:0.1em">APP FAILED TO LOAD</div>
        <div style="color:rgba(255,255,255,0.45);font-size:0.8rem;max-width:320px;line-height:1.7">
          ${err.message}<br><br>
          Check <span style="color:#FFB800">src/supabase-config.js</span> keys
        </div>
        <button onclick="location.reload()" style="
          background:transparent;border:1px solid rgba(255,255,255,0.2);
          color:rgba(255,255,255,0.6);font-family:'Share Tech Mono',monospace;
          font-size:0.8rem;padding:10px 24px;border-radius:6px;cursor:pointer;">
          ↺ RELOAD
        </button>
      </div>`;
  }
}

// Safety net — clear loader if boot stalls
setTimeout(() => { if (app.innerHTML.includes('LOADING')) boot(); }, 5000);
boot();
