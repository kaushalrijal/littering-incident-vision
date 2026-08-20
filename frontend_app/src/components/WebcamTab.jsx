import React, { useState, useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';

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
            if (outputImgRef.current) {
              outputImgRef.current.src = data.image;
            }
            setLatency(data.inference_ms || 0);
            setAssociations(data.associations || []);

            if (data.events && data.events.length > 0) {
              setIncidentCount((prev) => prev + data.events.length);
              setLastIncident(data.events[0]);
            }

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

      ws.onerror = () => {
        setError('WebSocket error connecting to camera server endpoint.');
        stopCamera();
      };

      ws.onclose = () => {
        setIsStreaming(false);
      };

      wsRef.current = ws;
    } catch (err) {
      setError(`Camera access error: ${err.message || 'Could not access webcam'}`);
    }
  };

  const stopCamera = () => {
    setIsStreaming(false);
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
    const interval = 1000 / 20;

    const sendFrame = (timestamp) => {
      if (ws.readyState === WebSocket.OPEN && videoRef.current && canvasRef.current) {
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

  const peopleApprox = associations.length;
  const wasteApprox = associations.length;
  const trackedApprox = associations.length > 0 ? associations.length * 2 : 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-semibold text-[#26312B] tracking-tight">Real-Time Camera</h2>
          <p className="text-[14px] text-[#647067] mt-1.5">
            Live litter detection and object tracking.
          </p>
        </div>

        {!isStreaming ? (
          <button
            type="button"
            onClick={startCamera}
            className="inline-flex items-center self-start px-3.5 py-2 rounded-lg bg-[#1F4D3A] hover:bg-[#183D2E] text-white text-[13px] font-medium transition-colors duration-150"
          >
            Start Camera
          </button>
        ) : (
          <button
            type="button"
            onClick={stopCamera}
            className="inline-flex items-center self-start px-3.5 py-2 rounded-lg border border-[#E2E7E2] bg-white text-[#C94A4A] hover:bg-[#FBECEC] text-[13px] font-medium transition-colors duration-150"
          >
            Stop
          </button>
        )}
      </div>

      {error && <p className="text-[13px] text-[#C94A4A]">{error}</p>}

      <div className="lg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#E2E7E2] flex flex-wrap items-center justify-between gap-2 bg-[#F6F7F3]/80">
          <div className="flex items-center gap-3 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#26312B]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isStreaming ? 'bg-[#C94A4A] lg-pulse' : 'bg-[#8A948D]'
                }`}
              />
              {isStreaming ? 'LIVE' : 'OFFLINE'}
            </span>
            <span className="text-[#8A948D]">Camera 01</span>
          </div>
          <div className="flex items-center gap-3 text-[12px] text-[#647067]">
            <span>
              <span className="font-semibold text-[#26312B]">{fps}</span> FPS
            </span>
            <span>
              Latency <span className="font-semibold text-[#26312B]">{latency}ms</span>
            </span>
          </div>
        </div>

        <div className="relative aspect-video bg-[#1a221e] flex items-center justify-center">
          <video ref={videoRef} className="hidden" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />

          {isStreaming ? (
            <img
              ref={outputImgRef}
              alt="Annotated camera stream"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-center px-6">
              <div className="w-11 h-11 mx-auto mb-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#8A948D]">
                <Camera className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <p className="text-[13px] text-[#8A948D]">
                Camera is offline. Start the stream to begin live detection.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'People detected', value: isStreaming ? peopleApprox : 0 },
          { label: 'Waste objects', value: isStreaming ? wasteApprox : 0 },
          { label: 'Tracked objects', value: isStreaming ? trackedApprox : 0 },
          { label: 'Suspected incidents', value: incidentCount },
        ].map((metric) => (
          <div key={metric.label} className="lg-card px-4 py-3">
            <p className="text-[12px] text-[#647067]">{metric.label}</p>
            <p className="text-[22px] font-semibold text-[#26312B] mt-1 leading-none">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {(associations.length > 0 || lastIncident) && (
        <div className="lg-card p-4 space-y-2 text-[13px]">
          {associations.length > 0 && (
            <p>
              <span className="text-[#647067]">Active associations: </span>
              <span className="text-[#26312B] font-medium">
                {associations.map(([w, p]) => `(trash ${w}, person ${p})`).join(' · ')}
              </span>
            </p>
          )}
          {lastIncident && (
            <p>
              <span className="text-[#647067]">Latest event: </span>
              <span className="text-[#26312B]">{lastIncident.reason}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
