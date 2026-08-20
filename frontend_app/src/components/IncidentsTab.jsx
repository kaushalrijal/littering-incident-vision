import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ExternalLink,
  Play,
  Filter
} from 'lucide-react';

export default function IncidentsTab({ incidents, onUpdateStatus }) {
  const [filter, setFilter] = useState('all');
  const [selectedIncident, setSelectedIncident] = useState(null);

  const filteredIncidents = incidents.filter((inc) => {
    if (filter === 'all') return true;
    return inc.review_status === filter;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Confirmed
          </span>
        );
      case 'false_alarm':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> False Alarm
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" /> Pending Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 tracking-tight">Incident Review & Audit</h2>
          <p className="text-xs text-slate-400 mt-1">
            Review snapshot images, extracted evidence clips, and confirm suspected littering events ($L = N \land R \land S \land M$).
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800/80">
          {['all', 'pending', 'confirmed', 'false_alarm'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                filter === f
                  ? 'bg-slate-800 text-slate-100 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Incidents Grid */}
      {filteredIncidents.length === 0 ? (
        <div className="bg-slate-950 border border-slate-800 rounded-lg py-16 text-center text-slate-400 text-xs">
          No incidents match the selected filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredIncidents.map((inc) => {
            const timeSec = (inc.timestamp_ms / 1000).toFixed(1);
            return (
              <div
                key={inc.id}
                className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                {/* Snapshot Image */}
                <div 
                  className="relative aspect-video bg-black cursor-pointer group"
                  onClick={() => setSelectedIncident(inc)}
                >
                  {inc.snapshot_path ? (
                    <img
                      src={`/media/${inc.snapshot_path}`}
                      alt="Incident Snapshot"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
                      No snapshot image
                    </div>
                  )}

                  <div className="absolute top-3 left-3">
                    {getStatusBadge(inc.review_status)}
                  </div>

                  <div className="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-sm px-2 py-0.5 rounded text-[11px] font-mono text-cyan-400 border border-slate-800">
                    {Math.round(inc.confidence * 100)}% conf
                  </div>

                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-3 py-1.5 rounded-full bg-cyan-500 text-slate-950 text-xs font-semibold flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5 fill-current" /> Review Clip
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-mono text-slate-300">
                        {inc.video_filename || `Video #${inc.video_id}`}
                      </span>
                      <span className="font-mono text-cyan-400">@{timeSec}s</span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed font-sans line-clamp-2">
                      {inc.reason}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-900 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onUpdateStatus(inc.id, 'confirmed')}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          inc.review_status === 'confirmed'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900 text-slate-400 hover:text-emerald-400 border-slate-800'
                        }`}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => onUpdateStatus(inc.id, 'false_alarm')}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          inc.review_status === 'false_alarm'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : 'bg-slate-900 text-slate-400 hover:text-rose-400 border-slate-800'
                        }`}
                      >
                        False Alarm
                      </button>
                    </div>

                    <button
                      onClick={() => setSelectedIncident(inc)}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                      title="Inspect clip"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail & Evidence Clip Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-3xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Incident Evidence: #{selectedIncident.id}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Extracted 5-second evidence clip around event timestamp ({(selectedIncident.timestamp_ms / 1000).toFixed(1)}s).
                </p>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="text-slate-400 hover:text-slate-200 text-xs px-2.5 py-1 rounded bg-slate-800"
              >
                Close (Esc)
              </button>
            </div>

            {/* Video Clip Player */}
            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-800">
              {selectedIncident.clip_path ? (
                <video
                  controls
                  autoPlay
                  src={`/media/${selectedIncident.clip_path}`}
                  className="w-full h-full object-contain"
                >
                  Your browser does not support video playback.
                </video>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                  No video clip extracted for this event.
                </div>
              )}
            </div>

            <div className="p-3 rounded bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
              <span className="text-cyan-400 font-medium">Detection Reason:</span>
              <p className="text-slate-400 leading-relaxed font-sans">{selectedIncident.reason}</p>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onUpdateStatus(selectedIncident.id, 'confirmed');
                    setSelectedIncident({ ...selectedIncident, review_status: 'confirmed' });
                  }}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                >
                  Confirm Littering
                </button>
                <button
                  onClick={() => {
                    onUpdateStatus(selectedIncident.id, 'false_alarm');
                    setSelectedIncident({ ...selectedIncident, review_status: 'false_alarm' });
                  }}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30"
                >
                  Mark False Alarm
                </button>
              </div>

              {selectedIncident.clip_path && (
                <a
                  href={`/media/${selectedIncident.clip_path}`}
                  download
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Download Evidence Clip (.mp4)
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
