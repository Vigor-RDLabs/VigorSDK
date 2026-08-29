// ─────────────────────────────────────────────────────────────────────────────
// camera-connectivity — Web demo client
//
// PHASE 1 DEVELOPMENT CLIENT
// ─────────────────────────────────────────────────────────────────────────────
// ICE server configuration and signaling URL are loaded from window.CAMERA_CONFIG,
// which must be injected by the page before this script loads.
//
// For local development, set window.CAMERA_CONFIG in index.html or a config script:
//
//   <script>
//     window.CAMERA_CONFIG = {
//       signalingUrl: "ws://localhost:8000/v1/signaling/",
//       iceServers: [
//         { urls: "stun:localhost:3478" },
//         { urls: "turn:localhost:3478?transport=udp",
//           username: "dev_user",
//           credential: "dev_pass" }
//       ]
//     };
//   </script>
//
// In production the config object is populated server-side from the session API
// response and NEVER contains long-lived static credentials.
// ─────────────────────────────────────────────────────────────────────────────

// ── Config resolution ─────────────────────────────────────────────────────────
const CONFIG = window.CAMERA_CONFIG || {};
const SIGNALING_BASE_URL = CONFIG.signalingUrl || "ws://localhost:8000/v1/signaling/";
const ICE_SERVERS = CONFIG.iceServers || [
    // ⚠ DEVELOPMENT ONLY fallback — replace with session API response in production
    { urls: "stun:localhost:3478" }
];

// --- Global state variables ---
let pc = null;
let dc = null;
let startTime = null;

const clientId = randomId(10);
const WS_URL = SIGNALING_BASE_URL + clientId;

const websocket = new WebSocket(WS_URL);

// --- WebSocket handlers ---
websocket.onopen = () => {
    const startBtn = document.getElementById('start');
    if (startBtn) startBtn.disabled = false;
};

websocket.onmessage = async (evt) => {
    if (typeof evt.data !== 'string') return;
    try {
        const message = JSON.parse(evt.data);
        if (message.type === "offer") {
            const offerSdp = document.getElementById('offer-sdp');
            if (offerSdp) offerSdp.textContent = message.sdp;
            await handleOffer(message);
        }
    } catch (e) {
        console.error("WS message error:", e);
    }
};

// --- PeerConnection initialization ---
function createPeerConnection() {
    const config = {
        bundlePolicy: "max-bundle",
        iceServers: ICE_SERVERS
    };

    // Assign to global pc variable
    pc = new RTCPeerConnection(config);

    const logConnect = document.getElementById('ice-connection-state');
    const logGather  = document.getElementById('ice-gathering-state');
    const logSignal  = document.getElementById('signaling-state');
    const logData    = document.getElementById('data-channel');

    // ICE Connection
    pc.addEventListener('iceconnectionstatechange', () => {
        if (logConnect) logConnect.textContent += ' -> ' + pc.iceConnectionState;
    });
    if (logConnect) logConnect.textContent = pc.iceConnectionState;

    // ICE Gathering
    pc.addEventListener('icegatheringstatechange', () => {
        if (logGather) logGather.textContent += ' -> ' + pc.iceGatheringState;
    });
    if (logGather) logGather.textContent = pc.iceGatheringState;

    // Signaling state
    pc.addEventListener('signalingstatechange', () => {
        if (logSignal) logSignal.textContent += ' -> ' + pc.signalingState;
    });
    if (logSignal) logSignal.textContent = pc.signalingState;

    // Receive Track (Video/Audio)
    pc.ontrack = (evt) => {
        const mediaDiv = document.getElementById('media');
        const videoEl  = document.getElementById('video');
        if (mediaDiv) mediaDiv.style.display = 'block';
        if (videoEl) {
            videoEl.srcObject = evt.streams[0];
            videoEl.play().catch(err => console.warn("Autoplay blocked:", err));
        }
    };

    // Data Channel
    pc.ondatachannel = (evt) => {
        dc = evt.channel;
        dc.onopen = () => {
            if (logData) {
                logData.textContent += '- data channel open\n';
                logData.scrollTop = logData.scrollHeight;
            }
        };

        let dcTimeout = null;
        dc.onmessage = (evt) => {
            if (typeof evt.data !== 'string') return;
            if (logData) {
                logData.textContent += '< ' + evt.data + '\n';
                logData.scrollTop = logData.scrollHeight;
            }

            dcTimeout = setTimeout(() => {
                if (!dc || dc.readyState !== 'open') return;
                const message = `Pong ${currentTimestamp()}`;
                if (logData) {
                    logData.textContent += '> ' + message + '\n';
                    logData.scrollTop = logData.scrollHeight;
                }
                dc.send(message);
            }, 1000);
        };

        dc.onclose = () => {
            clearTimeout(dcTimeout);
            if (logData) logData.textContent += '- data channel close\n';
        };
    };

    return pc;
}

// --- WebRTC helpers ---
async function waitGatheringComplete() {
    return new Promise((resolve) => {
        if (!pc) return resolve();
        if (pc.iceGatheringState === 'complete') {
            resolve();
        } else {
            const checkState = () => {
                if (pc.iceGatheringState === 'complete') {
                    pc.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            };
            pc.addEventListener('icegatheringstatechange', checkState);
        }
    });
}

async function handleOffer(offer) {
    if (pc) stop(); // Clean up existing connection if any
    pc = createPeerConnection();
    await pc.setRemoteDescription(offer);
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    await waitGatheringComplete();

    const localSdp = document.getElementById('answer-sdp');
    if (localSdp) localSdp.textContent = pc.localDescription.sdp;

    const camId = document.getElementById('cam-id')?.value.trim() || "server";
    websocket.send(JSON.stringify({
        id: camId,
        type: pc.localDescription.type,
        sdp: pc.localDescription.sdp,
    }));
}

function start() {
    const startBtn = document.getElementById('start');
    const stopBtn  = document.getElementById('stop');
    const mediaDiv = document.getElementById('media');
    
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn)  stopBtn.style.display  = 'inline-block';
    if (mediaDiv) mediaDiv.style.display = 'block';

    const camId = document.getElementById('cam-id')?.value.trim() || "server";
    websocket.send(JSON.stringify({
        id: camId,
        type: "request",
    }));
}

function stop() {
    document.getElementById('stop').style.display  = 'none';
    document.getElementById('start').style.display = 'inline-block';
    if (document.getElementById('media')) document.getElementById('media').style.display = 'none';

    if (dc) {
        dc.close();
        dc = null;
    }

    if (pc) {
        pc.getTransceivers().forEach(t => t.stop && t.stop());
        pc.getSenders().forEach(s => s.track && s.track.stop());
        pc.close();
        pc = null;
    }
}

// --- Utilities ---
function randomId(length) {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    return [...Array(length)].map(() => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

function currentTimestamp() {
    if (startTime === null) startTime = Date.now();
    return Date.now() - startTime;
}
