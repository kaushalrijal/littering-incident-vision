import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Camera, ChevronRight, ChevronDown, Search, Loader2 } from 'lucide-react';
import Pagination from './Pagination';
import VideoReview from './VideoReview';

const DATE_OPTIONS = [
  { value: 1, label: '1 Day' },
  { value: 3, label: '3 Days' },
  { value: 7, label: '7 Days' },
  { value: 15, label: '15 Days' },
  { value: 30, label: '30 Days' },
];

export default function IncidentsTab({ pendingIncidentsTotal = 0, onUpdateStatus, onGoUpload }) {
  const [videoSummaries, setVideoSummaries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [days, setDays] = useState(3);

  const [selectedVideo, setSelectedVideo] = useState(null);
  const [videoIncidents, setVideoIncidents] = useState([]);
  const [loadingVideoId, setLoadingVideoId] = useState(null);

  const fetchSummaries = useCallback(async (p = 1, q = '', d = 3) => {
    setLoading(true);
    try {
      let url = `/api/review/video-summaries?page=${p}&page_size=10&days=${d}`;
      if (q) url += `&search=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setVideoSummaries(data.items);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch summaries:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    fetchSummaries(1, search, days);
  }, [search, days]);

  const handlePageChange = (p) => {
    setPage(p);
    fetchSummaries(p, search, days);
  };

  const handleDaysChange = (newDays) => {
    setDays(newDays);
    setPage(1);
    fetchSummaries(1, search, newDays);
  };

  const handleReviewVideo = async (vid) => {
    setLoadingVideoId(vid.id);
    try {
      const res = await fetch(`/api/incidents?video_id=${vid.id}&page_size=100`);
      if (res.ok) {
        const data = await res.json();
        setVideoIncidents(data.items);
        setSelectedVideo({ id: vid.id, filename: vid.filename });
      }
    } finally {
      setLoadingVideoId(null);
    }
  };

  const handleBack = () => {
    setSelectedVideo(null);
    setVideoIncidents([]);
    fetchSummaries(page, search, days);
  };

  const handleIncidentUpdate = async (incId, status) => {
    await onUpdateStatus(incId, status);
    setVideoIncidents(prev => prev.map(inc => inc.id === incId ? { ...inc, review_status: status } : inc));
  };

  if (selectedVideo) {
    return (
      <VideoReview
        videoName={selectedVideo.filename}
        incidents={videoIncidents}
        onBack={handleBack}
        onUpdateStatus={handleIncidentUpdate}
      />
    );
  }

  function StatusPill({ vid }) {
    const totalInc = vid.total_incidents || 0;
    const pending = vid.pending_count || 0;
    const confirmed = vid.confirmed_count || 0;
    const falseAlarm = vid.false_alarm_count || 0;

    if (totalInc === 0) {
      return <span className="text-[12px] text-[#8A948D]">No incidents</span>;
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {pending > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#FBF6EB] text-[#C58B2A]">
            {pending} pending
          </span>
        )}
        {confirmed > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#EAF2EC] text-[#3E7C59]">
            {confirmed} confirmed
          </span>
        )}
        {falseAlarm > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#FBECEC] text-[#C94A4A]">
            {falseAlarm} false alarm
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-semibold text-[#26312B] tracking-tight">Incident Review</h2>
          <p className="text-[14px] text-[#647067] mt-1.5">
            Review suspected littering events detected across processed footage.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[#647067]">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FBF6EB] text-[#C58B2A] font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {pendingIncidentsTotal} pending
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8A948D]" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search videos..."
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-[#E2E7E2] bg-white text-[13px] text-[#26312B] placeholder:text-[#8A948D] focus:outline-none focus:ring-2 focus:ring-[#3E7C59]/30 focus:border-[#3E7C59] transition-colors"
          />
        </div>
        <div className="relative">
          <select
            value={days}
            onChange={(e) => handleDaysChange(Number(e.target.value))}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-[#E2E7E2] bg-white text-[13px] text-[#26312B] font-medium hover:border-[#3E7C59] focus:outline-none focus:ring-2 focus:ring-[#3E7C59]/30 focus:border-[#3E7C59] transition-colors duration-150 cursor-pointer"
          >
            {DATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Last {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#647067] pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="lg-card overflow-hidden">
          <div className="animate-pulse">
            <div className="h-10 bg-[#F6F7F3] border-b border-[#E2E7E2]" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 border-b border-[#E2E7E2] last:border-0 px-4 flex items-center gap-4">
                <div className="h-3 w-24 bg-[#E2E7E2] rounded" />
                <div className="h-3 w-40 bg-[#E2E7E2] rounded flex-1" />
                <div className="h-3 w-28 bg-[#E2E7E2] rounded" />
                <div className="h-3 w-16 bg-[#E2E7E2] rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : videoSummaries.length === 0 ? (
        <div className="lg-card py-14 px-6 text-center">
          <div className="w-11 h-11 mx-auto mb-3 rounded-xl bg-[#EAF2EC] border border-[#E2E7E2] flex items-center justify-center text-[#1F4D3A]">
            <Camera className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <p className="text-[15px] font-medium text-[#26312B]">No videos found</p>
          <p className="text-[13px] text-[#647067] mt-1">
            {search ? 'Try a different search term.' : 'Process videos to start reviewing incidents.'}
          </p>
          {!search && (
            <button type="button" onClick={onGoUpload}
              className="mt-4 inline-flex items-center px-3.5 py-2 rounded-lg bg-[#1F4D3A] hover:bg-[#183D2E] text-white text-[13px] font-medium transition-colors">
              Upload Video
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="lg-card overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#F6F7F3] border-b border-[#E2E7E2]">
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-[#8A948D] uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-[#8A948D] uppercase tracking-wider">Title</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-[#8A948D] uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-[#8A948D] uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {videoSummaries.map((vid) => {
                  const totalInc = vid.total_incidents || 0;
                  const isLoading = loadingVideoId === vid.id;
                  return (
                    <tr key={vid.id} className="border-b border-[#E2E7E2] last:border-0 hover:bg-[#F6F7F3]/50 transition-colors">
                      <td className="px-4 py-3 text-[12px] text-[#647067] whitespace-nowrap">
                        {new Date(vid.created_at).toLocaleDateString([], {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-[#26312B] truncate max-w-xs">{vid.filename}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill vid={vid} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {totalInc > 0 ? (
                          <button type="button" onClick={() => handleReviewVideo(vid)} disabled={isLoading}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1F4D3A] hover:bg-[#183D2E] text-white text-[12px] font-medium transition-colors disabled:opacity-50">
                            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>Review <ChevronRight className="w-3.5 h-3.5" /></>}
                          </button>
                        ) : (
                          <span className="text-[12px] text-[#8A948D]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > 10 && (
            <Pagination currentPage={page} totalPages={Math.ceil(total / 10)} total={total} onPageChange={handlePageChange} />
          )}
        </>
      )}
    </div>
  );
}
