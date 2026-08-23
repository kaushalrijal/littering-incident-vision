import { useState, useEffect, useRef } from 'react';
import { Camera, CameraOff, AlertTriangle } from 'lucide-react';
import ToastStack from './ToastStack';
import { playIncidentAlarm, unlockAlarm } from '../lib/alarm';

// Colours for the overlay (match the dashboard theme).
const PERSON_COLOR = '#ffffff'; // white boxes on the dark video feed
const WASTE_COLOR = '#f43f5e'; // rose-500
const LINK_COLOR = '#f59e0b'; // amber-500 (waste -> person association)

const SEND_MIN_INTERVAL = 1000 / 30; // cap send attempts at ~30/s
const RESPONSE_WATCHDOG_MS = 2500; // if no reply in this long, allow a resend
const MAX_RECONNECT_DELAY = 8000;

const MAX_TOASTS = 4; // visible incident notifications at once
const TOAST_DURATION_MS = 6000; // auto-dismiss window per toast

export default function WebcamTab() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [associations, setAssociations] = useState([]);
  const [incidentCount, setIncidentCount] = useState(0);
  const [lastIncident, setLastIncident] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [evidenceRecording, setEvidenceRecording] = useState(false);
  const [staleBackend, setStaleBackend] = useState(false); // old backend: no evidence saving
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('offline'); // offline | connecting | live | reconnecting

  const videoRef = useRef(null);
  const overlayRef = useRef(null); // visible annotation canvas, layered over the video
  const captureRef = useRef(null); // offscreen canvas used to grab + encode frames
  const wsRef = useRef(null);

  const rafIdRef = useRef(null);
  const readyRef = useRef(true); // request/response pacing: true = safe to send next frame
  const lastSendRef = useRef(0);
  const manualStopRef = useRef(false); // true once the user clicks Stop (blocks reconnect)
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Map());

  // FPS accounting (based on frames actually returned by the server).
  const frameCounterRef = useRef(0);
  const fpsTimerRef = useRef(0);

  useEffect(() => {
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Overlay drawing -------------------------------------------------------
  const drawOverlay = (meta) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const w = meta.width;
    const h = meta.height;
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const dets = meta.detections || [];

    // Index persons by track id so we can draw association lines.
    const personById = {};
    for (const d of dets) {
      if (d.kind === 'person' && d.track_id != null) personById[d.track_id] = d;
    }

    // Association lines first, so boxes draw on top.
    ctx.lineWidth = 2;
    ctx.strokeStyle = LINK_COLOR;
    ctx.setLineDash([6, 4]);
    for (const d of dets) {
      if (d.kind === 'waste' && d.assoc_person != null && personById[d.assoc_person]) {
        const p = personById[d.assoc_person];
        const [wx1, wy1, wx2, wy2] = d.bbox;
        const [px1, py1, px2, py2] = p.bbox;
        ctx.beginPath();
        ctx.moveTo((wx1 + wx2) / 2, (wy1 + wy2) / 2);
        ctx.lineTo((px1 + px2) / 2, (py1 + py2) / 2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Boxes + labels.
    ctx.font = '14px "Fira Mono", ui-monospace, monospace';
    ctx.textBaseline = 'alphabetic';
    for (const d of dets) {
      const [x1, y1, x2, y2] = d.bbox;
      const color = d.kind === 'person' ? PERSON_COLOR : WASTE_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      let label = d.class_name || d.kind;
      if (d.track_id != null) label += ` #${d.track_id}`;
      if (typeof d.conf === 'number') label += ` ${d.conf.toFixed(2)}`;
      if (d.kind === 'waste' && d.assoc_person != null) label += ` -> p${d.assoc_person}`;

      const padX = 4;
      const textW = ctx.measureText(label).width;
      const boxH = 17;
      const labelY = y1 - boxH >= 0 ? y1 - boxH : y1; // keep the label on screen
      ctx.fillStyle = color;
      ctx.fillRect(x1, labelY, textW + padX * 2, boxH);
      ctx.fillStyle = '#17171a';
      ctx.fillText(label, x1 + padX, labelY + boxH - 4);
    }
  };

  // -- Incident notifications (toast + alarm) --------------------------------
  const dismissToast = (id) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const clearToasts = () => {
    toastTimersRef.current.forEach((timer) => clearTimeout(timer));
    toastTimersRef.current.clear();
    setToasts([]);
  };

  const pushIncidentToasts = (events) => {
    const fresh = events.map((ev) => {
      const id = ++toastIdRef.current;
      const timer = setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
      toastTimersRef.current.set(id, timer);
      return {
        id,
        message: ev.reason || 'Waste dropped near a person.',
        confidence: ev.confidence,
        incidentId: ev.incident_id,
      };
    });
    setToasts((prev) => {
      const next = [...prev, ...fresh];
      // Keep only the newest MAX_TOASTS; stop the timers of the dropped ones.
      for (const t of next.slice(0, Math.max(0, next.length - MAX_TOASTS))) {
        const timer = toastTimersRef.current.get(t.id);
        if (timer) {
          clearTimeout(timer);
          toastTimersRef.current.delete(t.id);
        }
      }
      return next.slice(Math.max(0, next.length - MAX_TOASTS));
    });
  };

  // -- Incoming server messages ---------------------------------------------
  const handleMessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type === 'error') {
      // Terminal server-side error (e.g. another session active, model failed).
      setError(data.message || 'The camera server reported an error.');
      manualStopRef.current = true; // do not auto-reconnect into the same error
      teardown();
      setIsStreaming(false);
      setStatus('offline');
      return;
    }

    if (data.type !== 'webcam_frame') return;

    // A reply arrived: it is safe to send the next frame.
    readyRef.current = true;

    if (data.mode === 'meta') {
      drawOverlay(data);
      // New backends tag every frame with `recording`. Its absence means the
      // server process predates evidence saving (started before an update and
      // never restarted) — surface that instead of failing silently.
      if (data.recording === undefined) setStaleBackend(true);
    }
    setLatency(data.inference_ms || 0);
    setAssociations(data.associations || []);
    if (typeof data.recording === 'boolean') {
      setEvidenceRecording(data.recording);
      setStaleBackend(false);
    }

    if (data.events && data.events.length > 0) {
      setIncidentCount((prev) => prev + data.events.length);
      setLastIncident(data.events[0]);
      playIncidentAlarm();
      pushIncidentToasts(data.events);
    }

    frameCounterRef.current += 1;
    const now = performance.now();
    if (now - fpsTimerRef.current >= 1000) {
      setFps(frameCounterRef.current);
      frameCounterRef.current = 0;
      fpsTimerRef.current = now;
    }
  };

  // -- WebSocket lifecycle ---------------------------------------------------
  const connectWs = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/webcam`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      readyRef.current = true;
      lastSendRef.current = 0;
      setError(null);
      setIsStreaming(true);
      setStatus('live');
    };

    ws.onmessage = handleMessage;

    ws.onerror = () => {
      // Let onclose decide whether to reconnect; errors are usually followed by
      // a close. Avoid tearing down the camera on a transient blip.
    };

    ws.onclose = () => {
      if (manualStopRef.current) {
        setIsStreaming(false);
        setStatus('offline');
        return;
      }
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    setStatus('reconnecting');
    setIsStreaming(true); // camera is still on; we are just re-opening the socket
    const attempt = reconnectAttemptsRef.current;
    const delay = Math.min(MAX_RECONNECT_DELAY, 1000 * 2 ** attempt);
    reconnectAttemptsRef.current = attempt + 1;
    setError(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`);
    reconnectTimerRef.current = setTimeout(() => {
      if (manualStopRef.current) return;
      connectWs();
    }, delay);
  };

  // -- Frame capture + send loop --------------------------------------------
  const startSendLoop = () => {
    const tick = () => {
      const ws = wsRef.current;
      const video = videoRef.current;
      const canvas = captureRef.current;
      const now = performance.now();

      // Watchdog: if a reply never came, allow the stream to recover.
      if (!readyRef.current && now - lastSendRef.current > RESPONSE_WATCHDOG_MS) {
        readyRef.current = true;
      }

      if (
        ws &&
        ws.readyState === WebSocket.OPEN &&
        video &&
        canvas &&
        readyRef.current &&
        now - lastSendRef.current >= SEND_MIN_INTERVAL &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        readyRef.current = false;
        lastSendRef.current = now;
        canvas.toBlob(
          (blob) => {
            const sock = wsRef.current;
            if (blob && sock && sock.readyState === WebSocket.OPEN) {
              sock.send(blob); // binary JPEG; server replies with metadata
            } else {
              readyRef.current = true; // nothing sent; do not stall the loop
            }
          },
          'image/jpeg',
          0.7
        );
      }

      if (!manualStopRef.current) {
        rafIdRef.current = requestAnimationFrame(tick);
      }
    };
    rafIdRef.current = requestAnimationFrame(tick);
  };

  // -- Start / stop ----------------------------------------------------------
  const startCamera = async () => {
    setError(null);
    setIncidentCount(0);
    setLastIncident(null);
    clearToasts();
    setEvidenceRecording(false);
    setStaleBackend(false);
    manualStopRef.current = false;
    reconnectAttemptsRef.current = 0;
    setStatus('connecting');

    // Create the audio context inside this click gesture so the incident
    // alarm is allowed to play later without another interaction.
    unlockAlarm();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      fpsTimerRef.current = performance.now();
      connectWs();
      startSendLoop();
    } catch (err) {
      setStatus('offline');
      setError(`Camera access error: ${err.message || 'Could not access webcam'}`);
    }
  };

  // Close socket + camera + loops, but leave the user-facing state alone.
  const teardown = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (wsRef.current) {
      const ws = wsRef.current;
      ws.onclose = null; // prevent the reconnect handler from firing on manual close
      ws.onerror = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    const canvas = overlayRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    clearToasts();
    setEvidenceRecording(false);
  };

  const stopCamera = () => {
    manualStopRef.current = true;
    teardown();
    setIsStreaming(false);
    setStatus('offline');
    setFps(0);
    setLatency(0);
    setAssociations([]);
  };

  const statusLabel = {
    offline: 'Offline',
    connecting: 'Connecting',
    live: 'Live',
    reconnecting: 'Reconnecting',
  }[status];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <span className="chip pointer-events-none gap-2">
          <span
            className={`h-1.5 w-1.5 ${
              status === 'live'
                ? 'animate-pulse bg-success'
                : status === 'offline'
                  ? 'bg-muted-foreground'
                  : 'animate-pulse bg-foreground'
            }`}
          />
          {statusLabel}
        </span>

        {!isStreaming ? (
          <button onClick={startCamera} className="btn btn-solid px-5 py-2.5">
            <Camera className="h-4 w-4" strokeWidth={2.5} /> Start live camera
          </button>
        ) : (
          <button onClick={stopCamera} className="btn btn-danger px-5 py-2.5">
            <CameraOff className="h-4 w-4" strokeWidth={2.5} /> Stop stream
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 border border-destructive p-4 text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
          <p className="text-xs leading-relaxed font-semibold">{error}</p>
        </div>
      )}

      {staleBackend && (
        <div className="flex items-start gap-3 border border-[#f59e0b] p-4 text-[#b45309]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
          <div>
            <p className="text-xs leading-relaxed font-semibold">
              Evidence saving is inactive — the backend server is running an
              older version.
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              Incidents still appear live, but they are not saved for review.
              Restart the backend (stop it and run{' '}
              <code className="bg-muted px-1 py-0.5 font-mono">python run.py</code>{' '}
              again), then start the camera.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden border border-border bg-black">
            <video
              ref={videoRef}
              className={isStreaming ? 'h-full w-full object-contain' : 'hidden'}
              playsInline
              muted
              autoPlay
            />
            <canvas
              ref={overlayRef}
              className={
                isStreaming
                  ? 'pointer-events-none absolute inset-0 h-full w-full object-contain'
                  : 'hidden'
              }
            />
            <canvas ref={captureRef} className="hidden" />

            {!isStreaming && (
              <div className="space-y-3 p-8 text-center">
                <p className="font-mono text-[11px] text-muted-foreground uppercase">
                  Camera offline — press start above
                </p>
              </div>
            )}

            {isStreaming && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-background px-2.5 py-1.5 font-mono text-[10px] leading-none font-bold tracking-wider uppercase">
                <span
                  className={`h-1.5 w-1.5 ${
                    status === 'live'
                      ? 'animate-pulse bg-success'
                      : 'animate-pulse bg-destructive'
                  }`}
                />
                {statusLabel}
              </div>
            )}

            {isStreaming && evidenceRecording && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-destructive px-2 py-1 font-mono text-[10px] leading-none font-bold tracking-wider text-white uppercase">
                <span className="h-1.5 w-1.5 animate-pulse bg-white" />
                Rec
              </div>
            )}
          </div>
        </div>

        <div className="panel self-start">
          <div className="panel-header">
            <p className="text-xs font-bold tracking-[0.08em] uppercase">Telemetry</p>
          </div>

          <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
            <div className="bg-sidebar p-4">
              <p className="label-micro">Stream fps</p>
              <p className="mt-2 font-mono text-xl leading-none font-bold tabular-nums">{fps}</p>
            </div>
            <div className="bg-sidebar p-4">
              <p className="label-micro">Inference</p>
              <p className="mt-2 font-mono text-xl leading-none font-bold tabular-nums">
                {latency}ms
              </p>
            </div>
          </div>

          <div className="space-y-2 border-b border-border p-4">
            <p className="label-micro">Active associations</p>
            <div className="flex flex-wrap gap-1.5">
              {associations.length > 0 ? (
                associations.map(([w, p], i) => (
                  <span
                    key={i}
                    className="border border-foreground px-1.5 py-0.5 font-mono text-[11px] font-bold"
                  >
                    ({w}, {p})
                  </span>
                ))
              ) : (
                <span className="font-mono text-[11px] text-muted-foreground">NONE</span>
              )}
            </div>
          </div>

          <div className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <span className="label-micro">Live incidents</span>
              <span className="font-mono text-sm font-bold text-destructive tabular-nums">
                {incidentCount}
              </span>
            </div>

            {lastIncident ? (
              <div className="border-l-4 border-destructive bg-sidebar p-2.5 pl-3">
                <p className="text-xs leading-snug font-medium">{lastIncident.reason}</p>
                <p className="mt-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  {lastIncident.incident_id != null
                    ? `Saved for review — incident #${lastIncident.incident_id}`
                    : 'Detected'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nothing detected in this session.
              </p>
            )}
          </div>
        </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
