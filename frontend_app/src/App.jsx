import { useState, useEffect } from 'react';
import { ROUTES, usePath, navigate } from './lib/router';
import Sidebar from './components/Sidebar';
import UploadTab from './components/UploadTab';
import VideosTab from './components/VideosTab';
import IncidentsTab from './components/IncidentsTab';
import WebcamTab from './components/WebcamTab';
import ReviewTab from './components/ReviewTab';

const SECTION_META = {
  upload: {
    title: 'Upload footage',
    desc: 'Queue a clip through detection, tracking and the event engine.',
  },
  videos: {
    title: 'Videos & output',
    desc: 'Processing queue, annotated outputs and per-video results.',
  },
  incidents: {
    title: 'Incident review',
    desc: 'Suspected littering events extracted by the rule engine.',
  },
  review: {
    title: 'Review by video',
    desc: 'Walk each video’s detected events and confirm or dismiss them.',
  },
  webcam: {
    title: 'Live camera',
    desc: 'Run the full pipeline on your webcam in real time.',
  },
};

export default function App() {
  const path = usePath();
  const activeTab = ROUTES[path] ?? 'upload';
  const [videos, setVideos] = useState([]);
  const [incidentCount, setIncidentCount] = useState(0);
  const [liveStats, setLiveStats] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function fetchCounts() {
    // Videos: pull up to 100 so dropdowns stay populated; totals come from
    // the paginated envelopes the API now returns.
    Promise.all([
      fetch('/api/videos?page=1&page_size=100'),
      fetch('/api/incidents?page=1&page_size=1'),
    ])
      .then(async ([vRes, iRes]) => {
        if (vRes.ok) {
          const body = await vRes.json();
          setVideos(body.items ?? []);
        }
        if (iRes.ok) {
          const body = await iRes.json();
          setIncidentCount(body.total ?? 0);
        }
      })
      .catch((err) => console.error('Failed to fetch counts:', err));
  }

  useEffect(() => {
    fetchCounts();

    let closed = false;
    let ws;
    let retryTimer;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws/events`);

      ws.onopen = () => !closed && setWsConnected(true);

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'video_progress') {
            setLiveStats((prev) => ({ ...prev, [message.video_id]: message.stats }));
          } else if (message.type === 'video_status') {
            fetchCounts();
            setRefreshKey((k) => k + 1);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        if (closed) return;
        setWsConnected(false);
        retryTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      if (ws) ws.close();
    };
  }, []);

  const handleUploadSuccess = () => {
    fetchCounts();
    setRefreshKey((k) => k + 1);
    navigate('/videos');
  };

  const meta = SECTION_META[activeTab];
  const processingCount = videos.filter((v) => v.status === 'processing').length;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar wsConnected={wsConnected} processingCount={processingCount} />

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 border-b border-border bg-card">
          <div className="flex items-center justify-between gap-6 px-6 py-7 md:px-10">
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-black tracking-tight md:text-4xl">Kalanka</h1>
              <p className="mt-1 text-sm text-muted-foreground">Littering incident detection</p>
            </div>

            <div className="hidden shrink-0 gap-2 sm:flex">
              <span className="border border-border px-3.5 py-2.5 font-mono text-[11px] leading-none font-bold">
                {videos.length} VIDEOS
              </span>
              <span className="border border-border px-3.5 py-2.5 font-mono text-[11px] leading-none font-bold text-destructive">
                {incidentCount} INCIDENTS
              </span>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
          <section className="mb-9">
            <h2 className="text-2xl font-black tracking-tight uppercase md:text-3xl">
              {meta.title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{meta.desc}</p>
          </section>

          {activeTab === 'upload' && <UploadTab onUploadSuccess={handleUploadSuccess} />}
          {activeTab === 'videos' && <VideosTab liveStats={liveStats} refreshKey={refreshKey} />}
          {activeTab === 'incidents' && <IncidentsTab refreshKey={refreshKey} />}
          {activeTab === 'review' && <ReviewTab refreshKey={refreshKey} />}
          {activeTab === 'webcam' && <WebcamTab />}
        </div>
      </main>
    </div>
  );
}
