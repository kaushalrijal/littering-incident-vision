import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import UploadTab from './components/UploadTab';
import VideosTab from './components/VideosTab';
import IncidentsTab from './components/IncidentsTab';
import WebcamTab from './components/WebcamTab';

export default function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const [videos, setVideos] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [liveStats, setLiveStats] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    fetchVideos();
    fetchIncidents();
    setupWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const fetchVideos = async () => {
    try {
      const res = await fetch('/api/videos');
      if (res.ok) {
        const data = await res.json();
        setVideos(data);
      }
    } catch (err) {
      console.error('Failed to fetch videos:', err);
    }
  };

  const fetchIncidents = async () => {
    try {
      const res = await fetch('/api/incidents');
      if (res.ok) {
        const data = await res.json();
        setIncidents(data);
      }
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    }
  };

  const setupWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/events`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'video_progress') {
          setLiveStats((prev) => ({
            ...prev,
            [message.video_id]: message.stats,
          }));
        } else if (message.type === 'video_status') {
          fetchVideos();
          fetchIncidents();
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      // Reconnect after 3 seconds
      setTimeout(setupWebSocket, 3000);
    };

    wsRef.current = ws;
  };

  const handleUploadSuccess = (newVideo) => {
    fetchVideos();
    setActiveTab('videos');
  };

  const handleReprocess = async (videoId) => {
    try {
      const res = await fetch(`/api/videos/${videoId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      if (res.ok) {
        fetchVideos();
        fetchIncidents();
      }
    } catch (err) {
      console.error('Failed to reprocess video:', err);
    }
  };

  const handleUpdateIncidentStatus = async (incidentId, reviewStatus) => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: reviewStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncidents((prev) =>
          prev.map((inc) => (inc.id === incidentId ? updated : inc))
        );
      }
    } catch (err) {
      console.error('Failed to update incident status:', err);
    }
  };

  const activeProcessingCount = videos.filter((v) => v.status === 'processing').length;

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
      {/* Roboflow-inspired Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        wsConnected={wsConnected}
        activeProcessingCount={activeProcessingCount}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-900 overflow-y-auto">
        {/* Top Minimal Bar */}
        <header className="h-16 border-b border-slate-800/80 px-8 flex items-center justify-between bg-slate-950/40 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-200 capitalize">
              {activeTab.replace('_', ' ')}
            </h2>
            <span className="text-slate-600">•</span>
            <span className="text-xs text-slate-400 font-mono">
              Purwanchal Campus • Minor Project
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
              {videos.length} Videos
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
              {incidents.length} Incidents
            </span>
          </div>
        </header>

        {/* Tab Content Body */}
        <div className="p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'upload' && <UploadTab onUploadSuccess={handleUploadSuccess} />}
          {activeTab === 'videos' && (
            <VideosTab
              videos={videos}
              onReprocess={handleReprocess}
              liveStats={liveStats}
            />
          )}
          {activeTab === 'incidents' && (
            <IncidentsTab
              incidents={incidents}
              onUpdateStatus={handleUpdateIncidentStatus}
            />
          )}
          {activeTab === 'webcam' && <WebcamTab />}
        </div>
      </main>
    </div>
  );
}
