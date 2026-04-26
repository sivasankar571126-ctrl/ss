// ============================================================
//  App.js  –  SALIM SOS  (Vanilla JS, no build step needed)
//  Runs directly from index.html via <script type="module">
// ============================================================

import {
  PATIENT,
  GUARDIANS,
  activateSOS,
  resolveSOS,
  listenSOS
} from './firebase-config.js';

// ── State ──────────────────────────────────────────────────────
let currentRole    = null;   // 'sender' | 'guardian'
let emergencyState = null;
let sirenPlaying   = false;
let muted          = false;
let timerInterval  = null;
let locInterval    = null;
let elapsed        = 0;
let myCoords       = null;
let map            = null;
let salimMarker    = null;
let guardianMarker = null;
let routeLine      = null;
let audioCtx       = null;
let oscNode        = null;
let gainNode       = null;

// ── Root element ───────────────────────────────────────────────
const app = document.getElementById('app');

// ── Haversine distance (metres) ────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function fmtDist(m) {
  if (isNaN(m) || m === null) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(2)} km`;
}
function fmtTime(s) {
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

// ── GPS watcher ────────────────────────────────────────────────
function watchGPS(onUpdate) {
  if (!('geolocation' in navigator)) return;
  return navigator.geolocation.watchPosition(
    pos => onUpdate({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
    err => console.warn('GPS:', err.message),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// ── Siren (Web Audio API) ──────────────────────────────────────
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
    function sweep() {
      if (!oscNode) return;
      oscNode.frequency.linearRampToValueAtTime(1100, audioCtx.currentTime + 0.4);
      oscNode.frequency.linearRampToValueAtTime(600,  audioCtx.currentTime + 0.8);
      setTimeout(sweep, 800);
    }
    oscNode.frequency.setValueAtTime(600, audioCtx.currentTime);
    sweep();
    sirenPlaying = true;
  } catch (e) { console.error('Audio:', e); }
}

function stopSiren() {
  try {
    if (oscNode)  { oscNode.stop(); oscNode = null; }
    if (gainNode) { gainNode.disconnect(); gainNode = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
  } catch (_) {}
  sirenPlaying = false;
}

// ── Leaflet Map helpers ────────────────────────────────────────
function initMap(lat, lng) {
  if (map) return;
  map = L.map('map').setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(map);
}

const redIcon = L.divIcon({
  html: `<div style="
    width:20px;height:20px;border-radius:50%;
    background:#FF1C1C;border:3px solid #fff;
    box-shadow:0 0 14px rgba(255,28,28,0.8);
    animation:dotPulse 1s infinite alternate;">
  </div>`,
  iconSize: [20, 20], iconAnchor: [10, 10], className: ''
});
const blueIcon = L.divIcon({
  html: `<div style="
    width:18px;height:18px;border-radius:50%;
    background:#4FC3F7;border:3px solid #fff;
    box-shadow:0 0 10px rgba(79,195,247,0.8);">
  </div>`,
  iconSize: [18, 18], iconAnchor: [9, 9], className: ''
});

function updateMap(salimLat, salimLng, myLat, myLng) {
  if (!map) initMap(salimLat, salimLng);

  if (!salimMarker) {
    salimMarker = L.marker([salimLat, salimLng], { icon: redIcon })
      .addTo(map)
      .bindPopup(`<b style="color:#FF1C1C">🆘 ${PATIENT.name}</b><br>${PATIENT.phone}`);
  } else {
    salimMarker.setLatLng([salimLat, salimLng]);
  }

  if (myLat && myLng) {
    if (!guardianMarker) {
      guardianMarker = L.marker([myLat, myLng], { icon: blueIcon })
        .addTo(map)
        .bindPopup('<b style="color:#4FC3F7">📍 You (Guardian)</b>');
    } else {
      guardianMarker.setLatLng([myLat, myLng]);
    }

    // Draw connecting line
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline([[salimLat, salimLng], [myLat, myLng]], {
      color: '#FF3333', weight: 4, opacity: 0.85, dashArray: '10 6'
    }).addTo(map);

    // Fit both markers
    map.fitBounds([[salimLat, salimLng], [myLat, myLng]], { padding: [40, 40] });

    // Update distance badge
    const dist = haversine(salimLat, salimLng, myLat, myLng);
    const db = document.getElementById('dist-badge');
    if (db) db.textContent = `📏 Distance: ${fmtDist(dist)}`;
  } else {
    map.setView([salimLat, salimLng], 15);
  }
}

// ══════════════════════════════════════════════════════════════
//  VIEWS
// ══════════════════════════════════════════════════════════════

// ── 0. Role Selector ──────────────────────────────────────────
function renderRoleSelector() {
  currentRole = null;
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
        SYSTEM ONLINE · FIREBASE CONNECTED
      </div>
    </div>
  `;

  document.getElementById('btn-sender').addEventListener('click',   renderSenderView);
  document.getElementById('btn-guardian').addEventListener('click', renderGuardianView);
}

// ── 1. SENDER VIEW ────────────────────────────────────────────
function renderSenderView() {
  currentRole = 'sender';
  let gpsWatchId = null;
  let isEmergency = emergencyState?.emergency_status === true;

  function render() {
    isEmergency = emergencyState?.emergency_status === true;
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
          <span class="dot" id="gps-dot" style="background:#FFB800;animation:dotPulse 0.8s infinite"></span>
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
            <div class="coord-row">
              <span class="coord-lbl">LATITUDE</span>
              <span class="coord-val" id="c-lat">${Number(emergencyState.latitude).toFixed(7)}</span>
            </div>
            <div class="coord-row">
              <span class="coord-lbl">LONGITUDE</span>
              <span class="coord-val" id="c-lng">${Number(emergencyState.longitude).toFixed(7)}</span>
            </div>
          </div>

          <button class="resolve-btn" id="resolve-btn">✓ MARK AS SAFE / RESOLVED</button>
        ` : `
          <div class="sos-button-wrap">
            <button class="sos-btn" id="sos-btn">
              <span class="ring"></span>
              <span class="ring ring2"></span>
              <div class="btn-inner">
                <span class="btn-icon">🆘</span>
                <span class="btn-label">ACTIVATE</span>
                <span class="btn-sub">EMERGENCY SOS</span>
              </div>
            </button>
          </div>
          <p class="sender-hint">
            Press only in a real emergency.<br>
            All ${GUARDIANS.length} guardians will be alerted instantly.
          </p>
        `}
      </div>
    `;

    if (isEmergency) document.body.classList.add('emergency-active');
    else document.body.classList.remove('emergency-active');

    // Back button
    document.getElementById('back-btn').addEventListener('click', () => {
      if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
      clearInterval(timerInterval); elapsed = 0;
      clearInterval(locInterval);
      document.body.classList.remove('emergency-active');
      renderRoleSelector();
    });

    // GPS updates
    if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = watchGPS(coords => {
      myCoords = coords;
      const dot = document.getElementById('gps-dot');
      const txt = document.getElementById('gps-text');
      if (dot) { dot.style.background = '#00FF87'; dot.style.boxShadow = '0 0 7px #00FF87'; dot.style.animation = 'dotPulse 2s infinite'; }
      if (txt) txt.textContent = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}  ±${Math.round(coords.acc)}m`;

      // Update live coords
      const cl = document.getElementById('c-lat');
      const cn = document.getElementById('c-lng');
      const lc = document.getElementById('live-coords');
      if (cl) cl.textContent = coords.lat.toFixed(7);
      if (cn) cn.textContent = coords.lng.toFixed(7);
      if (lc) lc.textContent = `📍 ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
    });

    // SOS activate
    if (!isEmergency) {
      document.getElementById('sos-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('sos-btn');
        if (btn) { btn.disabled = true; btn.querySelector('.btn-label').textContent = 'ACTIVATING…'; }
        const lat = myCoords?.lat || 0;
        const lng = myCoords?.lng || 0;
        try {
          await activateSOS(lat, lng);
          elapsed = 0;
          clearInterval(timerInterval);
          timerInterval = setInterval(() => {
            elapsed++;
            const t = document.getElementById('live-timer');
            if (t) t.textContent = fmtTime(elapsed);
          }, 1000);
        } catch (e) { alert('❌ Failed to activate. Check internet.'); if (btn) btn.disabled = false; }
      });
    }

    // Resolve
    if (isEmergency) {
      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        elapsed++;
        const t = document.getElementById('live-timer');
        if (t) t.textContent = fmtTime(elapsed);
      }, 1000);

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

  // Re-render when Firebase state changes
  const origCallback = window._senderCallback;
  window._senderCallback = (data) => {
    emergencyState = data;
    render();
  };
  listenSOS(window._senderCallback);
  render();
}

// ── 2. GUARDIAN VIEW ──────────────────────────────────────────
function renderGuardianView() {
  currentRole = 'guardian';
  muted = false;
  let gpsWatchId = null;
  let alertTime  = null;

  function render() {
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
            <div class="coord-row">
              <span class="coord-lbl">LATITUDE</span>
              <span class="coord-val">${Number(emergencyState.latitude).toFixed(7)}</span>
            </div>
            <div class="coord-row">
              <span class="coord-lbl">LONGITUDE</span>
              <span class="coord-val">${Number(emergencyState.longitude).toFixed(7)}</span>
            </div>
          </div>

          <div id="map"></div>
          <p class="dist-badge" id="dist-badge">📏 Calculating distance…</p>

          <div class="action-btns">
            <button class="act-btn ${muted ? 'btn-muted' : 'btn-mute'}" id="mute-btn">
              ${muted ? '🔊 UNMUTE SIREN' : '🔇 MUTE / ACKNOWLEDGE'}
            </button>
            <a class="act-btn btn-call" href="tel:${PATIENT.phone.replace(/\s/g,'')}">
              📞 CALL ${PATIENT.name.toUpperCase()}
            </a>
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
            ${GUARDIANS.map(g => `
              <div class="gl-item">
                <span class="gl-dot"></span>
                ${g.name} · ${g.phone}
              </div>
            `).join('')}
          </div>
          <p class="sender-hint">Keep this tab open. Alerts fire automatically.</p>
        `}
      </div>
    `;

    // Back button
    document.getElementById('back-btn').addEventListener('click', () => {
      if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
      stopSiren();
      clearInterval(timerInterval); elapsed = 0;
      document.body.classList.remove('emergency-active');
      renderRoleSelector();
    });

    // Mute button
    document.getElementById('mute-btn')?.addEventListener('click', () => {
      muted = !muted;
      if (muted) stopSiren(); else { if (!muted) startSiren(); }
      render();
    });

    // Map + GPS
    if (isEmergency && emergencyState.latitude) {
      const salimLat = Number(emergencyState.latitude);
      const salimLng = Number(emergencyState.longitude);

      if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = watchGPS(coords => {
        myCoords = coords;
        updateMap(salimLat, salimLng, coords.lat, coords.lng);
      });
      // Init map with just Salim first
      setTimeout(() => {
        initMap(salimLat, salimLng);
        updateMap(salimLat, salimLng, myCoords?.lat, myCoords?.lng);
        if (map) map.invalidateSize();
      }, 100);

      // Timer
      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        elapsed++;
        const t = document.getElementById('g-timer');
        if (t) t.textContent = fmtTime(elapsed);
      }, 1000);
    }
  }

  listenSOS(data => {
    emergencyState = data;
    map = null; salimMarker = null; guardianMarker = null; routeLine = null;
    render();
  });
  render();
}

// ══════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════

// Check URL param for direct role access (PWA shortcuts)
const urlRole = new URLSearchParams(window.location.search).get('role');

// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => {
    console.log('SW registered:', reg.scope);
  }).catch(err => console.warn('SW failed:', err));
}

// Start
if (urlRole === 'sender')   renderSenderView();
else if (urlRole === 'guardian') renderGuardianView();
else renderRoleSelector();
