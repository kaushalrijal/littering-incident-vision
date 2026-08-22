import React, { useState, useEffect, useRef } from 'react';
import { Camera, CameraOff, Play, Pause, Activity, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function WebcamTab() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [associations, setAssociations] = useState([]);
  const [incidentCount, setIncidentCount] = useState(0);
  const [lastIncident, setLastIncident] = useState(null);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const outputImgRef = useRef(null);
  const wsRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const pendingFrameRef = useRef(false);
  const pendingSinceRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const frameCounterRef = useRef(0);
  const fpsTimerRef = useRef(performance.now());

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/webcam`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsStreaming(true);
        startStreamingLoop(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'webcam_frame') {
            // Previous frame fully processed: allow sending the next one.
            pendingFrameRef.current = false;
            if (outputImgRef.current) {
              outputImgRef.current.src = data.image;
            }
            setLatency(data.inference_ms || 0);
            setAssociations(data.associations || []);

            if (data.events && data.events.length > 0) {
              setIncidentCount((prev) => prev + data.events.length);
              setLastIncident(data.events[0]);
            }

            // Calculate FPS
            frameCounterRef.current += 1;
            const now = performance.now();
            if (now - fpsTimerRef.current >= 1000) {
              setFps(frameCounterRef.current);
              frameCounterRef.current = 0;
              fpsTimerRef.current = now;
            }
          }
        } catch (e) {
          console.error('Error parsing webcam WS message:', e);
        }
      };

      ws.onerror = (e) => {
        setError('WebSocket error connecting to camera server endpoint.');
        stopCamera();
      };

      ws.onclose = () => {
        // Fully stop the camera too, otherwise the webcam stays active
        // (light on) showing a frozen frame after the socket dies.
        stopCamera();
      };

      wsRef.current = ws;
    } catch (err) {
      setError(`Camera access error: ${err.message || 'Could not access webcam'}`);
    }
  };

  const stopCamera = () => {
    setIsStreaming(false);
    pendingFrameRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  };

  const startStreamingLoop = (ws) => {
    let lastSend = 0;
    const interval = 1000 / 30; // capture cap; real rate is limited by server

    const sendFrame = (timestamp) => {
      // Safety valve: if the server dropped our last frame (no response),
      // unblock sending instead of freezing the stream forever.
      if (pendingFrameRef.current && performance.now() - pendingSinceRef.current > 3000) {
        pendingFrameRef.current = false;
      }
      if (
        ws.readyState === WebSocket.OPEN &&
        !pendingFrameRef.current &&
        videoRef.current &&
        canvasRef.current
      ) {
        if (timestamp - lastSend >= interval) {
          lastSend = timestamp;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const b64Image = canvas.toDataURL('image/jpeg', 0.7);

            // Backpressure: mark in-flight so we never queue frames faster
            // than the server can process them (prevents latency buildup).
            pendingFrameRef.current = true;
            pendingSinceRef.current = performance.now();
            ws.send(
              JSON.stringify({
                image: b64Image,
                timestamp_ms: Date.now(),
              })
            );
          }
        }
      }
      if (ws.readyState === WebSocket.OPEN) {
        animationFrameIdRef.current = requestAnimationFrame(sendFrame);
      }
    };

    animationFrameIdRef.current = requestAnimationFrame(sendFrame);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 tracking-tight">Real-Time Webcam Testing</h2>
          <p className="text-xs text-slate-400 mt-1">
            Test YOLOv8 + ByteTrack + EventEngine in real time using your laptop or USB camera over WebSockets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isStreaming ? (
            <button
              onClick={startCamera}
              className="px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium text-xs tracking-wide transition-colors flex items-center gap-2"
            >
              <Camera className="w-4 h-4" /> Start Live Camera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="px-4 py-2 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 font-medium text-xs tracking-wide transition-colors flex items-center gap-2"
            >
              <CameraOff className="w-4 h-4" /> Stop Stream
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Stream Canvas & HUD Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Canvas Container */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center">
            {/* Hidden raw video & offscreen canvas */}
            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />

            {/* Output Processed Stream Image */}
            {isStreaming ? (
              <img
                ref={outputImgRef}
                alt="Real-time Annotated Camera Stream"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center space-y-3 p-8">
                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-500">
                  <Camera className="w-6 h-6" />
                </div>
                <p className="text-xs text-slate-400">
                  Camera stream offline. Click <span className="text-cyan-400 font-medium">Start Live Camera</span> above.
                </p>
              </div>
            )}

            {/* Live Indicator Overlay */}
            {isStreaming && (
              <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-sm px-2.5 py-1 rounded border border-slate-800 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                LIVE STREAM
              </div>
            )}
          </div>
        </div>

        {/* Real-time Telemetry Panel */}
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-cyan-400" /> Real-time Metrics
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 text-[11px]">Stream FPS</span>
                <p className="text-lg font-mono font-semibold text-slate-100 mt-0.5">{fps}</p>
              </div>
              <div className="p-3 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 text-[11px]">Inference Latency</span>
                <p className="text-lg font-mono font-semibold text-cyan-400 mt-0.5">{latency}ms</p>
              </div>
            </div>

            {/* Active Associations Box */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-300">Active Associations (Trash, Person):</span>
              <div className="p-3 rounded bg-slate-900 border border-slate-800 font-mono text-xs text-yellow-300">
                {associations.length > 0 ? (
                  associations.map(([w, p], i) => (
                    <span key={i} className="inline-block mr-2 px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20">
                      ({w}, {p})
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 font-sans">None</span>
                )}
              </div>
            </div>

            {/* Live Incidents Alert Banner */}
            <div className="p-3.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Live Incidents
                </span>
                <span className="font-mono text-rose-400 font-bold">{incidentCount}</span>
              </div>

              {lastIncident ? (
                <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 leading-snug">
                  {lastIncident.reason}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">No littering incidents detected in stream.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
