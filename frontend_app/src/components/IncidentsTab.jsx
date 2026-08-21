import React, { useState } from 'react';
import { AlertTriangle, Camera } from 'lucide-react';
import Pagination from './Pagination';

function formatTimestamp(ms) {
  const totalSec = Math.floor((ms || 0) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getObjectLabel(inc) {
  if (inc.class_names) {
    try {
      const parsed = typeof inc.class_names === 'string' ? JSON.parse(inc.class_names) : inc.class_names;
      if (Array.isArray(parsed) && parsed.length) return parsed[0];
      if (typeof parsed === 'string') return parsed;
    } catch {
      if (typeof inc.class_names === 'string' && !inc.class_names.startsWith('[')) {
        return inc.class_names;
      }
    }
  }
  const match = (inc.reason || '').match(/waste object '([^']+)'/i);
  return match ? match[1] : 'Waste object';
}

function ReviewStatus({ status }) {
  const config = {
    confirmed: { label: 'Confirmed', color: 'bg-[#3E7C59]', text: 'text-[#3E7C59]', bg: 'bg-[#EAF2EC]' },
    false_alarm: { label: 'False alarm', color: 'bg-[#C94A4A]', text: 'text-[#C94A4A]', bg: 'bg-[#FBECEC]' },
    pending: { label: 'Pending review', color: 'bg-[#C58B2A]', text: 'text-[#C58B2A]', bg: 'bg-[#FBF6EB]' },
  };
  const item = config[status] || config.pending;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium ${item.bg} ${item.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
      {item.label}
    </span>
  );
}

function RuleTimeline() {
  const steps = [
    { key: 'N', label: 'Near' },
    { key: 'R', label: 'Released' },
    { key: 'S', label: 'Stationary' },
    { key: 'M', label: 'Moved Away' },
  ];

  return (
    <div className="rounded-xl border border-[#E2E7E2] bg-[#F6F7F3] p-3.5">
      <p className="text-[11px] font-semibold text-[#8A948D] uppercase tracking-wide mb-3">
        Event reasoning · L = N ∧ R ∧ S ∧ M
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((step) => (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center min-w-[58px]">
              <div className="w-9 h-9 rounded-lg bg-[#1F4D3A] text-white flex items-center justify-center text-[13px] font-semibold">
                {step.key}
              </div>
              <span className="text-[11px] text-[#647067] mt-1.5 text-center leading-tight">
                {step.label}
              </span>
            </div>
            <span className="text-[#8A948D] px-0.5 mb-4">→</span>
          </React.Fragment>
        ))}
        <div className="flex flex-col items-center min-w-[72px]">
          <div className="px-2.5 h-9 rounded-lg bg-[#C58B2A] text-white flex items-center justify-center text-[11px] font-semibold">
            LITTERING
          </div>
          <span className="text-[11px] text-[#647067] mt-1.5">Suspected</span>
        </div>
      </div>
    </div>
  );
}

export default function IncidentsTab({
  incidents,
  incidentsTotal = 0,
  pendingIncidentsTotal = 0,
  currentPage = 1,
  totalPages = 1,
  filter = 'all',
  onFilterChange,
  onPageChange,
  onUpdateStatus,
  onGoUpload,
}) {
  const [selectedIncident, setSelectedIncident] = useState(null);

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'false_alarm', label: 'False Alarm' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-semibold text-[#26312B] tracking-tight">Incident Review</h2>
          <p className="text-[14px] text-[#647067] mt-1.5">
            Review suspected littering events detected by the system.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[#647067]">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FBF6EB] text-[#C58B2A] font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {pendingIncidentsTotal} pending
          </span>
          <span className="px-2.5 py-1 rounded-md bg-[#EEF1EC] font-medium text-[#26312B]">
            {incidentsTotal} total
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 border border-[#E2E7E2] rounded-lg bg-white p-1 w-fit">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors duration-150 ${
              filter === f.id
                ? 'bg-[#EAF2EC] text-[#1F4D3A]'
                : 'text-[#647067] hover:text-[#26312B]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {incidents.length === 0 ? (
        <div className="lg-card py-14 px-6 text-center">
          <div className="w-11 h-11 mx-auto mb-3 rounded-xl bg-[#EAF2EC] border border-[#E2E7E2] flex items-center justify-center text-[#1F4D3A]">
            <Camera className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <p className="text-[15px] font-medium text-[#26312B]">No incidents detected</p>
          <p className="text-[13px] text-[#647067] mt-1 max-w-md mx-auto">
            Suspected littering events will appear here after video processing.
          </p>
          {incidentsTotal === 0 && (
            <button
              type="button"
              onClick={onGoUpload}
              className="mt-4 inline-flex items-center px-3.5 py-2 rounded-lg bg-[#1F4D3A] hover:bg-[#183D2E] text-white text-[13px] font-medium transition-colors duration-150"
            >
              Upload Video
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {incidents.map((inc) => {
            const objectLabel = getObjectLabel(inc);
            const conf = Math.round((inc.confidence || 0) * 100);

            return (
              <article key={inc.id} className="lg-card overflow-hidden flex flex-col sm:flex-row">
                <button
                  type="button"
                  onClick={() => setSelectedIncident(inc)}
                  className="sm:w-[42%] aspect-video sm:aspect-auto sm:min-h-[160px] bg-[#1a221e] shrink-0 relative overflow-hidden group"
                >
                  {inc.snapshot_path ? (
                    <img
                      src={`/media/${inc.snapshot_path}`}
                      alt="Incident snapshot"
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[12px] text-[#8A948D]">
                      No snapshot
                    </div>
                  )}
                </button>

                <div className="flex-1 p-4 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[14px] font-semibold text-[#26312B]">Suspected littering</p>
                      <p className="text-[13px] text-[#647067] mt-0.5 capitalize">
                        {objectLabel} detected
                      </p>
                    </div>
                    <ReviewStatus status={inc.review_status} />
                  </div>

                  <p className="text-[12px] text-[#8A948D] mb-3">
                    {formatTimestamp(inc.timestamp_ms)} ·{' '}
                    {inc.video_filename || `Video #${inc.video_id}`}
                  </p>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] mb-3">
                    <div>
                      <p className="text-[#8A948D]">Confidence</p>
                      <p className="font-semibold text-[#26312B] mt-0.5">{conf}%</p>
                    </div>
                    <div>
                      <p className="text-[#8A948D]">Track</p>
                      <p className="font-semibold text-[#26312B] mt-0.5">
                        {inc.track_id != null ? `#${inc.track_id}` : '—'}
                      </p>
                    </div>
                  </div>

                  <p className="text-[12px] text-[#647067] line-clamp-2 mb-4 flex-1">
                    <span className="font-medium text-[#26312B]">Reason: </span>
                    {inc.reason || 'Rule engine flagged this event.'}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedIncident(inc)}
                      className="px-3 py-1.5 rounded-lg bg-[#1F4D3A] hover:bg-[#183D2E] text-white text-[12px] font-medium transition-colors duration-150"
                    >
                      Review Incident
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateStatus(inc.id, 'confirmed')}
                      className="px-2.5 py-1.5 rounded-lg border border-[#E2E7E2] bg-white text-[#26312B] hover:bg-[#EEF1EC] text-[12px] font-medium transition-colors duration-150"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateStatus(inc.id, 'false_alarm')}
                      className="px-2.5 py-1.5 rounded-lg border border-[#E2E7E2] bg-white text-[#C94A4A] hover:bg-[#FBECEC] text-[12px] font-medium transition-colors duration-150"
                    >
                      False Alarm
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          </div>

          {incidentsTotal > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              total={incidentsTotal}
              onPageChange={onPageChange}
            />
          )}
        </div>
      )}

      {selectedIncident && (
        <div className="fixed inset-0 z-50 bg-[#26312B]/40 flex items-center justify-center p-4">
          <div className="lg-card max-w-5xl w-full max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-[18px] font-semibold text-[#26312B]">Suspected Littering</h3>
                <p className="text-[13px] text-[#647067] mt-0.5">
                  Incident #{selectedIncident.id} · Evidence review
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                className="text-[13px] text-[#647067] hover:text-[#26312B] transition-colors duration-150"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3 space-y-3">
                <div className="aspect-video bg-[#1a221e] rounded-xl overflow-hidden border border-[#E2E7E2]">
                  {selectedIncident.clip_path ? (
                    <video
                      controls
                      autoPlay
                      src={`/media/${selectedIncident.clip_path}`}
                      className="w-full h-full object-contain"
                    >
                      Your browser does not support video playback.
                    </video>
                  ) : selectedIncident.snapshot_path ? (
                    <img
                      src={`/media/${selectedIncident.snapshot_path}`}
                      alt="Incident evidence"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[13px] text-[#8A948D]">
                      No evidence available
                    </div>
                  )}
                </div>
                {selectedIncident.clip_path && (
                  <a
                    href={`/media/${selectedIncident.clip_path}`}
                    download
                    className="text-[13px] text-[#1F4D3A] hover:underline font-medium"
                  >
                    Download evidence clip
                  </a>
                )}
              </div>

              <div className="lg:col-span-2 space-y-4">
                <div className="space-y-3 text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#647067]">Status</span>
                    <ReviewStatus status={selectedIncident.review_status} />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-[#E2E7E2] pt-3">
                    <span className="text-[#647067]">Detected object</span>
                    <span className="font-semibold text-[#26312B] capitalize">
                      {getObjectLabel(selectedIncident)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-[#E2E7E2] pt-3">
                    <span className="text-[#647067]">Confidence</span>
                    <span className="font-semibold text-[#26312B]">
                      {Math.round((selectedIncident.confidence || 0) * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-[#E2E7E2] pt-3">
                    <span className="text-[#647067]">Timestamp</span>
                    <span className="font-semibold text-[#26312B]">
                      {formatTimestamp(selectedIncident.timestamp_ms)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-[#E2E7E2] pt-3">
                    <span className="text-[#647067]">Video</span>
                    <span className="font-medium text-[#26312B] text-right truncate max-w-[55%]">
                      {selectedIncident.video_filename || `#${selectedIncident.video_id}`}
                    </span>
                  </div>
                </div>

                <RuleTimeline />

                <div>
                  <p className="text-[12px] font-semibold text-[#26312B] mb-1.5">Event reasoning</p>
                  <p className="text-[13px] text-[#647067] leading-relaxed">
                    {selectedIncident.reason ||
                      'N — Object appeared near person · R — Released · S — Remained stationary · M — Person moved away'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateStatus(selectedIncident.id, 'confirmed');
                      setSelectedIncident({ ...selectedIncident, review_status: 'confirmed' });
                    }}
                    className="px-3 py-2 rounded-lg bg-[#3E7C59] hover:bg-[#34684A] text-white text-[13px] font-medium transition-colors duration-150"
                  >
                    Confirm littering
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateStatus(selectedIncident.id, 'false_alarm');
                      setSelectedIncident({ ...selectedIncident, review_status: 'false_alarm' });
                    }}
                    className="px-3 py-2 rounded-lg border border-[#E2E7E2] bg-white text-[#C94A4A] hover:bg-[#FBECEC] text-[13px] font-medium transition-colors duration-150"
                  >
                    Mark False Alarm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
