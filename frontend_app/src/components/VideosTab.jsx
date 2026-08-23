import { useState, useEffect } from 'react';
import { RefreshCw, Eye, X } from 'lucide-react';
import Pagination from './Pagination';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'processing', label: 'Processing' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'name', label: 'Name A-Z' },
  { id: 'incidents', label: 'Most incidents' },
];

const PAGE_SIZE = 10;

const PERIODS = [
  { id: 'all', label: 'All time' },
  { id: '1', label: 'Today' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
];

function StatusBadge({ status }) {
  if (status === 'completed') {
    return (
      <span className="inline-block bg-foreground px-2 py-1 text-[10px] leading-none font-bold tracking-[0.08em] text-background uppercase">
        Completed
      </span>
    );
  }
  if (status === 'processing') {
    return (
      <span className="inline-flex animate-pulse items-center gap-1.5 border border-foreground px-2 py-1 text-[10px] leading-none font-bold tracking-[0.08em] uppercase">
        <span className="h-1.5 w-1.5 bg-foreground" /> Processing
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-block border border-destructive px-2 py-1 text-[10px] leading-none font-bold tracking-[0.08em] text-destructive uppercase">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-block border border-border px-2 py-1 text-[10px] leading-none font-bold tracking-[0.08em] text-muted-foreground uppercase">
      Pending
    </span>
  );
}

export default function VideosTab({ liveStats, refreshKey }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [days, setDays] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedVideo, setSelectedVideo] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (sort !== 'newest') params.set('sort', sort);
    if (status !== 'all') params.set('status', status);
    if (days !== 'all') params.set('days', days);
    if (search) params.set('search', search);

    let cancelled = false;
    fetch(`/api/videos?${params.toString()}`)
      .then(async (res) => (res.ok ? res.json() : { items: [], total: 0, total_pages: 1 }))
      .then((data) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.total_pages ?? 1);
      })
      .catch((err) => console.error('Failed to fetch videos:', err));
    return () => {
      cancelled = true;
    };
  }, [status, sort, days, page, search, refreshKey]);

  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  useEffect(() => {
    if (!selectedVideo) return;
    const onKey = (e) => e.key === 'Escape' && setSelectedVideo(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedVideo]);

  const handleReprocess = async (videoId) => {
    try {
      await fetch(`/api/videos/${videoId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
    } catch (err) {
      console.error('Failed to reprocess video:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) =>
            status === f.id ? (
              <button
                key={f.id}
                onClick={() => changeFilter(setStatus)(f.id)}
                className="chip chip-active"
              >
                {f.label}
              </button>
            ) : (
              <button key={f.id} onClick={() => changeFilter(setStatus)(f.id)} className="chip">
                {f.label}
              </button>
            )
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search filename…"
            className="field sm:w-56"
          />
          <select
            value={days}
            onChange={(e) => changeFilter(setDays)(e.target.value)}
            className="field cursor-pointer sm:w-36"
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => changeFilter(setSort)(e.target.value)}
            className="field cursor-pointer sm:w-44"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <p className="text-xs font-bold tracking-[0.08em] uppercase">Video library</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            SHOWING {items.length} OF {total}
          </p>
        </div>

        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">
                File
              </th>
              <th className="px-4 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">
                Status
              </th>
              <th className="px-4 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">
                Progress
              </th>
              <th className="px-4 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">
                Incidents
              </th>
              <th className="px-4 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">
                Uploaded
              </th>
              <th className="px-5 py-3.5 text-right text-[11px] font-bold tracking-[0.08em] uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <p className="text-sm font-bold">No videos found</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Upload footage or clear the active filters.
                  </p>
                </td>
              </tr>
            ) : (
              items.map((vid) => {
                const stats = liveStats[vid.id] || {};
                const isProcessing = vid.status === 'processing';
                const isWebcam = vid.source_type === 'webcam';
                const processedFrames =
                  stats.processed_frames ?? vid.processed_frames ?? 0;
                const totalFrames = stats.total_frames ?? vid.total_frames ?? 0;
                const pct =
                  totalFrames > 0 ? Math.round((processedFrames / totalFrames) * 100) : 0;
                const incidentCount =
                  stats.detected_incidents ?? vid.detected_incidents ?? vid.incident_count ?? 0;

                return (
                  <tr key={vid.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-sidebar">
                    <td className="max-w-xs px-5 py-4">
                      <p className="truncate text-sm font-bold">{vid.filename}</p>
                      <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        #{vid.id}
                        {isWebcam ? (
                          <span className="inline-flex items-center gap-1 border border-destructive px-1.5 py-0.5 text-[9px] leading-none font-bold tracking-[0.08em] text-destructive uppercase">
                            <span className="h-1 w-1 bg-destructive" /> Live
                          </span>
                        ) : (
                          <>
                            {` · ${(vid.duration_ms / 1000).toFixed(1)}s`}
                            {vid.width > 0 && ` · ${vid.width}×${vid.height}`}
                          </>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={vid.status} />
                    </td>
                    <td className="px-4 py-4">
                      {isProcessing ? (
                        <div className="w-32 space-y-1.5">
                          <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                            <span>
                              {processedFrames}/{totalFrames || '?'}
                            </span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-muted">
                            <div
                              className="h-full bg-foreground transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {vid.processed_frames ? `${vid.processed_frames} frames` : '—'}
                          {vid.fps ? ` · ${vid.fps.toFixed(1)} fps` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {incidentCount > 0 ? (
                        <span className="text-sm font-bold tabular-nums">{incidentCount}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground tabular-nums">0</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {new Date(vid.created_at).toLocaleString([], {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {!isWebcam && vid.status === 'completed' && (
                          <button
                            onClick={() => setSelectedVideo(vid)}
                            className="btn btn-outline gap-1.5 px-3 py-1.5"
                          >
                            <Eye className="h-3.5 w-3.5" /> Output
                          </button>
                        )}
                        {!isWebcam && (
                          <button
                            onClick={() => handleReprocess(vid.id)}
                            disabled={isProcessing}
                            className="btn btn-outline gap-1.5 px-3 py-1.5"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Re-run
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <Pagination currentPage={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      </div>

      {selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4">
          <div className="panel max-w-4xl w-full shadow-lg">
            <div className="panel-header">
              <div className="min-w-0">
                <p className="label-micro">Annotated output</p>
                <h3 className="truncate text-base font-black tracking-tight">
                  {selectedVideo.filename}
                </h3>
              </div>
              <button
                onClick={() => setSelectedVideo(null)}
                className="btn btn-outline shrink-0 p-2"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="aspect-video overflow-hidden border-b border-border bg-black">
              <video
                controls
                autoPlay
                src={`/media/output/${selectedVideo.id}.mp4`}
                className="h-full w-full object-contain"
              >
                Your browser does not support HTML5 video playback.
              </video>
            </div>

            <div className="flex items-center justify-between gap-4 bg-sidebar px-5 py-4">
              <p className="font-mono text-[11px] text-muted-foreground uppercase">
                {((selectedVideo.duration_ms || 0) / 1000).toFixed(1)}s ·{' '}
                {selectedVideo.fps ? `${selectedVideo.fps.toFixed(1)} fps` : 'fps n/a'} ·{' '}
                {selectedVideo.detected_incidents} incidents
              </p>
              <a href={`/media/output/${selectedVideo.id}.mp4`} download className="btn btn-solid px-3.5 py-2">
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
