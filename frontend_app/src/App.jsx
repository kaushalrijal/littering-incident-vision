import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import UploadTab from './components/UploadTab';
import VideosTab from './components/VideosTab';
import IncidentsTab from './components/IncidentsTab';
import WebcamTab from './components/WebcamTab';

const PAGE_SIZE = 10;

export default function App() {
  const [activeTab, setActiveTab] = useState('videos');
  const [liveStats, setLiveStats] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const wsRef = useRef(null);

  // Videos pagination
  const [videos, setVideos] = useState([]);
  const [videosTotal, setVideosTotal] = useState(0);
  const [videoPage, setVideoPage] = useState(1);

  // Incidents pagination + server-side filter
  const [incidents, setIncidents] = useState([]);
  const [incidentsTotal, setIncidentsTotal] = useState(0);
  const [pendingIncidentsTotal, setPendingIncidentsTotal] = useState(0);
  const [incidentPage, setIncidentPage] = useState(1);
  const [incidentFilter, setIncidentFilter] = useState('all');

  const videoPageRef = useRef(videoPage);
  const incidentPageRef = useRef(incidentPage);
  const incidentFilterRef = useRef(incidentFilter);

  useEffect(() => { videoPageRef.current = videoPage; }, [videoPage]);
  useEffect(() => { incidentPageRef.current = incidentPage; }, [incidentPage]);
  useEffect(() => { incidentFilterRef.current = incidentFilter; }, [incidentFilter]);

  const fetchVideos = useCallback(async (page = 1) => {
    try {
      const res = await fetch(`/api/videos?page=${page}&page_size=${PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setVideos(data.items);
        setVideosTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch videos:', err);
    }
  }, []);

  const fetchIncidents = useCallback(async (page = 1, status) => {
    try {
      let url = `/api/incidents?page=${page}&page_size=${PAGE_SIZE}`;
      if (status && status !== 'all') url += `&status=${status}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.items);
        setIncidentsTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    }
  }, []);

  const fetchPendingIncidentsCount = useCallback(async () => {
    try {
      const res = await fetch('/api/incidents?page=1&page_size=1&status=pending');
      if (res.ok) {
        const data = await res.json();
        setPendingIncidentsTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch pending count:', err);
    }
  }, []);

  useEffect(() => {
    fetchVideos(1);
    fetchIncidents(1, 'all');
    fetchPendingIncidentsCount();
    setupWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

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
          fetchVideos(videoPageRef.current);
          fetchIncidents(incidentPageRef.current, incidentFilterRef.current);
          fetchPendingIncidentsCount();
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
    fetchVideos(1);
    setVideoPage(1);
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
        fetchVideos(videoPage);
        fetchIncidents(1, incidentFilter);
        setIncidentPage(1);
        fetchPendingIncidentsCount();
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
        fetchPendingIncidentsCount();
      }
    } catch (err) {
      console.error('Failed to update incident status:', err);
    }
  };

  const handleVideoPageChange = (page) => {
    setVideoPage(page);
    fetchVideos(page);
  };

  const handleIncidentPageChange = (page) => {
    setIncidentPage(page);
    fetchIncidents(page, incidentFilter);
  };

  const handleIncidentFilterChange = (filter) => {
    setIncidentFilter(filter);
    setIncidentPage(1);
    fetchIncidents(1, filter);
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
              videosTotal={videosTotal}
              incidentsTotal={incidentsTotal}
              currentPage={videoPage}
              totalPages={Math.max(1, Math.ceil(videosTotal / PAGE_SIZE))}
              onPageChange={handleVideoPageChange}
              onReprocess={handleReprocess}
              liveStats={liveStats}
              onGoUpload={() => handleSetActiveTab('upload')}
            />
          )}
          {activeTab === 'incidents' && (
            <IncidentsTab
              incidents={incidents}
              incidentsTotal={incidentsTotal}
              pendingIncidentsTotal={pendingIncidentsTotal}
              currentPage={incidentPage}
              totalPages={Math.max(1, Math.ceil(incidentsTotal / PAGE_SIZE))}
              filter={incidentFilter}
              onFilterChange={handleIncidentFilterChange}
              onPageChange={handleIncidentPageChange}
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
