import { useState, useEffect } from 'react';
import { Play, X } from 'lucide-react';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'false_alarm', label: 'False alarm' },
];

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'confidence', label: 'Confidence' },
  { id: 'timestamp', label: 'In-video time' },
];

function StatusBadge({ status }) {
  if (status === 'confirmed') {
    return (
      <span className="inline-block bg-success px-2 py-1 text-[10px] leading-none font-bold tracking-[0.08em] text-white uppercase">
        Confirmed
      </span>
    );
  }
  if (status === 'false_alarm') {
    return (
      <span className="inline-block bg-destructive px-2 py-1 text-[10px] leading-none font-bold tracking-[0.08em] text-white uppercase">
        False alarm
      </span>
    );
  }
  return (
    <span className="inline-block border border-foreground bg-card px-2 py-0.5 text-[10px] leading-none font-bold tracking-[0.08em] uppercase">
      Pending
    </span>
  );
}

export default function IncidentsTab({ videos, refreshKey }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [videoId, setVideoId] = useState('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIncident, setSelectedIncident] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (sort !== 'newest') params.set('sort', sort);
    if (status !== 'all') params.set('status', status);
    if (videoId !== 'all') params.set('video_id', videoId);
    if (minConfidence > 0) params.set('min_confidence', minConfidence / 100);
    if (search) params.set('search', search);

    let cancelled = false;
    fetch(`/api/incidents?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => console.error('Failed to fetch incidents:', err));
    return () => {
      cancelled = true;
    };
  }, [status, sort, videoId, minConfidence, search, refreshKey]);

  useEffect(() => {
    if (!selectedIncident) return;
    const onKey = (e) => e.key === 'Escape' && setSelectedIncident(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIncident]);

  const updateStatus = async (incidentId, reviewStatus) => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: reviewStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((inc) => (inc.id === incidentId ? updated : inc)));
        setSelectedIncident((prev) =>
          prev && prev.id === incidentId ? updated : prev
        );
      }
    } catch (err) {
      console.error('Failed to update incident status:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) =>
            status === f.id ? (
              <button
                key={f.id}
                onClick={() => setStatus(f.id)}
                className="chip chip-active"
              >
                {f.label}
              </button>
            ) : (
              <button key={f.id} onClick={() => setStatus(f.id)} className="chip">
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
            placeholder="Search reason or video…"
            className="field sm:w-52"
          />
          <select
            value={videoId}
            onChange={(e) => setVideoId(e.target.value)}
            className="field cursor-pointer sm:w-44"
          >
            <option value="all">All videos</option>
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                #{v.id} {v.filename}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
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

      <label className="flex flex-wrap items-center gap-3">
        <span className="label-micro">Min confidence</span>
        <input
          type="range"
          min="0"
          max="95"
          step="5"
          value={minConfidence}
          onChange={(e) => setMinConfidence(Number(e.target.value))}
          className="h-1 w-40 cursor-pointer appearance-none bg-border accent-[oklch(0.141_0.005_285.823)]"
        />
        <span className="w-9 font-mono text-[11px] font-bold tabular-nums">{minConfidence}%</span>
      </label>

      <div className="panel">
        <div className="panel-header">
          <p className="text-xs font-bold tracking-[0.08em] uppercase">Detected incidents</p>
          <p className="font-mono text-[11px] text-muted-foreground">{items.length} SHOWN</p>
        </div>

        {items.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-sm font-bold">No incidents found</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Either the filters are too strict or nothing suspicious was detected.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2 lg:grid-cols-3">
            {items.map((inc) => {
              const timeSec = (inc.timestamp_ms / 1000).toFixed(1);
              return (
                <article
                  key={inc.id}
                  className="group flex flex-col border border-border transition-colors hover:border-foreground"
                >
                  <div
                    className="relative aspect-video cursor-pointer overflow-hidden border-b border-border bg-black"
                    onClick={() => setSelectedIncident(inc)}
                  >
                    {inc.snapshot_path ? (
                      <img
                        src={`/media/${inc.snapshot_path}`}
                        alt={`Incident #${inc.id} snapshot`}
                        className="h-full w-full object-cover grayscale transition-all duration-300 group-hover:scale-[1.02] group-hover:grayscale-0"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <span className="label-micro">No snapshot</span>
                      </div>
                    )}

                    <div className="absolute top-2 left-2">
                      <StatusBadge status={inc.review_status} />
                    </div>
                    <div className="absolute top-2 right-2 bg-foreground px-1.5 py-0.5 font-mono text-[10px] leading-relaxed font-bold text-background">
                      {Math.round(inc.confidence * 100)}%
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-[11px] text-muted-foreground uppercase">
                        {inc.video_filename || `VIDEO #${inc.video_id}`}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums">
                        @{timeSec}s
                      </span>
                    </div>

                    <p className="line-clamp-3 flex-1 text-xs leading-relaxed">{inc.reason}</p>

                    <div className="flex items-center gap-2 border-t border-border pt-3">
                      <button
                        onClick={() => updateStatus(inc.id, 'confirmed')}
                        className={`btn px-2.5 py-1.5 ${
                          inc.review_status === 'confirmed' ? 'btn-solid' : 'btn-outline'
                        }`}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => updateStatus(inc.id, 'false_alarm')}
                        className={`btn px-2.5 py-1.5 ${
                          inc.review_status === 'false_alarm'
                            ? 'btn-danger-active'
                            : 'btn-outline'
                        }`}
                      >
                        False alarm
                      </button>

                      <button
                        onClick={() => setSelectedIncident(inc)}
                        className="btn btn-outline ml-auto p-1.5"
                        title="Inspect clip"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4">
          <div className="panel max-w-3xl w-full shadow-lg">
            <div className="panel-header">
              <div>
                <p className="label-micro">Evidence clip</p>
                <h3 className="text-base font-black tracking-tight">
                  Incident #{selectedIncident.id} @{' '}
                  {(selectedIncident.timestamp_ms / 1000).toFixed(1)}s
                </h3>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="btn btn-outline shrink-0 p-2"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="aspect-video overflow-hidden border-b border-border bg-black">
              {selectedIncident.clip_path ? (
                <video
                  controls
                  autoPlay
                  src={`/media/${selectedIncident.clip_path}`}
                  className="h-full w-full object-contain"
                >
                  Your browser does not support video playback.
                </video>
              ) : (
                <div className="grid h-full place-items-center">
                  <span className="label-micro">No clip extracted</span>
                </div>
              )}
            </div>

            <div className="space-y-5 bg-sidebar p-5">
              <div className="border-l-4 border-foreground pl-4">
                <p className="label-micro">Detection reason</p>
                <p className="mt-1.5 text-xs leading-relaxed">{selectedIncident.reason}</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateStatus(selectedIncident.id, 'confirmed')}
                    className={`btn ${
                      selectedIncident.review_status === 'confirmed' ? 'btn-solid' : 'btn-outline'
                    }`}
                  >
                    Confirm littering
                  </button>
                  <button
                    onClick={() => updateStatus(selectedIncident.id, 'false_alarm')}
                    className={`btn ${
                      selectedIncident.review_status === 'false_alarm'
                        ? 'btn-danger-active'
                        : 'btn-outline'
                    }`}
                  >
                    Mark false alarm
                  </button>
                </div>

                {selectedIncident.clip_path && (
                  <a
                    href={`/media/${selectedIncident.clip_path}`}
                    download
                    className="font-mono text-[11px] font-bold underline underline-offset-2"
                  >
                    Download evidence (.mp4)
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
