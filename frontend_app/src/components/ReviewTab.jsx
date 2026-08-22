import { useState, useEffect } from 'react';
import { ArrowLeft, SearchX } from 'lucide-react';
import Pagination from './Pagination';
import VideoReview from './VideoReview';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Has pending' },
  { id: 'confirmed', label: 'Has confirmed' },
  { id: 'false_alarm', label: 'Has dismissed' },
];

const PERIODS = [
  { id: 'all', label: 'All time' },
  { id: '1', label: 'Today' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
];

const PAGE_SIZE = 10;

export default function ReviewTab({ refreshKey }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('all');
  const [days, setDays] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeVideo, setActiveVideo] = useState(null);
  const [incidents, setIncidents] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (activeVideo) return;

    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (status !== 'all') params.set('status', status);
    if (days !== 'all') params.set('days', days);
    if (search) params.set('search', search);

    let cancelled = false;
    fetch(`/api/review/video-summaries?${params.toString()}`)
      .then(async (res) => (res.ok ? res.json() : { items: [], total: 0, total_pages: 1 }))
      .then((data) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.total_pages ?? 1);
      })
      .catch((err) => console.error('Failed to fetch review summaries:', err));
    return () => {
      cancelled = true;
    };
  }, [status, days, page, search, refreshKey, activeVideo]);

  useEffect(() => {
    if (!activeVideo) return;

    let cancelled = false;
    fetch(`/api/incidents?video_id=${activeVideo.id}&page_size=100&sort=timestamp`)
      .then(async (res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (!cancelled) setIncidents(data.items ?? []);
      })
      .catch((err) => console.error('Failed to fetch video incidents:', err));
    return () => {
      cancelled = true;
    };
  }, [activeVideo]);

  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const reloadSummaries = () => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (status !== 'all') params.set('status', status);
    if (days !== 'all') params.set('days', days);
    if (search) params.set('search', search);
    fetch(`/api/review/video-summaries?${params.toString()}`)
      .then(async (res) => (res.ok ? res.json() : { items: [], total: 0, total_pages: 1 }))
      .then((data) => {
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.total_pages ?? 1);
      })
      .catch((err) => console.error('Failed to fetch review summaries:', err));
  };

  const updateStatus = async (incidentId, reviewStatus) => {
    const res = await fetch(`/api/incidents/${incidentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_status: reviewStatus }),
    });
    if (!res.ok) throw new Error(`Review update failed (${res.status})`);
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === incidentId ? { ...inc, review_status: reviewStatus } : inc))
    );
    reloadSummaries();
    return res.json();
  };

  if (activeVideo) {
    return (
      <div className="space-y-6">
        <button onClick={() => setActiveVideo(null)} className="btn btn-outline gap-2">
          <ArrowLeft className="h-3.5 w-3.5" /> All videos
        </button>

        <VideoReview
          videoName={activeVideo.filename}
          incidents={incidents}
          onBack={() => setActiveVideo(null)}
          onUpdateStatus={updateStatus}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
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
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <p className="text-xs font-bold tracking-[0.08em] uppercase">Videos awaiting review</p>
          <p className="font-mono text-[11px] text-muted-foreground">SHOWING {items.length} OF {total}</p>
        </div>

        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">Video</th>
              <th className="px-4 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">Detected</th>
              <th className="px-4 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">Pending</th>
              <th className="px-4 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">Confirmed</th>
              <th className="px-4 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">Dismissed</th>
              <th className="px-5 py-3.5 text-right text-[11px] font-bold tracking-[0.08em] uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <SearchX className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-3 text-sm font-bold">No videos to review</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Only videos with detected incidents appear here.
                  </p>
                </td>
              </tr>
            ) : (
              items.map((v) => {
                const reviewed = v.confirmed_count + v.false_alarm_count;
                const pct =
                  v.total_incidents > 0 ? Math.round((reviewed / v.total_incidents) * 100) : 0;
                return (
                  <tr
                    key={v.id}
                    className="border-b border-border last:border-b-0 transition-colors hover:bg-sidebar"
                  >
                    <td className="max-w-xs px-5 py-4">
                      <p className="truncate text-sm font-bold">{v.filename}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        #{v.id} ·{' '}
                        {new Date(v.created_at).toLocaleString([], {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-sm font-bold tabular-nums">{v.total_incidents}</td>
                    <td className="px-4 py-4">
                      {v.pending_count > 0 ? (
                        <span className="inline-block border border-destructive px-2 py-1 font-mono text-[10px] leading-none font-bold text-destructive tabular-nums">
                          {v.pending_count}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground tabular-nums">0</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm tabular-nums">{v.confirmed_count}</td>
                    <td className="px-4 py-4 text-sm tabular-nums">{v.false_alarm_count}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {pct}% REVIEWED
                        </span>
                        <button onClick={() => setActiveVideo(v)} className="btn btn-outline px-3 py-1.5">
                          Review
                        </button>
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
    </div>
  );
}
