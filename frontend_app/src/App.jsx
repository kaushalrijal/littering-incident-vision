import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import UploadTab from './components/UploadTab';
import VideosTab from './components/VideosTab';
import IncidentsTab from './components/IncidentsTab';
import WebcamTab from './components/WebcamTab';

export default function App() {
  const [activeTab, setActiveTab] = useState('videos');
  const [videos, setVideos] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [liveStats, setLiveStats] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      setTimeout(setupWebSocket, 3000);
    };

    wsRef.current = ws;
  };

  const handleUploadSuccess = () => {
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

  const handleSetActiveTab = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen lg-grid-bg overflow-hidden font-sans">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-[#26312B]/25 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        wsConnected={wsConnected}
        activeProcessingCount={activeProcessingCount}
        open={sidebarOpen}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="lg:hidden px-4 pt-4">
          <button
            type="button"
            className="p-1.5 text-[#647067] hover:text-[#26312B] hover:bg-[#EEF1EC] rounded-lg transition-colors duration-150"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <div className="p-5 sm:p-8 max-w-6xl w-full mx-auto">
          {activeTab === 'upload' && <UploadTab onUploadSuccess={handleUploadSuccess} />}
          {activeTab === 'videos' && (
            <VideosTab
              videos={videos}
              incidents={incidents}
              onReprocess={handleReprocess}
              liveStats={liveStats}
              onGoUpload={() => handleSetActiveTab('upload')}
            />
          )}
          {activeTab === 'incidents' && (
            <IncidentsTab
              incidents={incidents}
              onUpdateStatus={handleUpdateIncidentStatus}
              onGoUpload={() => handleSetActiveTab('upload')}
            />
          )}
          {activeTab === 'webcam' && <WebcamTab />}
        </div>
      </main>
    </div>
  );
}
