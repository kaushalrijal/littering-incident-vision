import React, { useState } from 'react';
import { 
  Film, 
  Play, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Loader2,
  Eye,
  FileText
} from 'lucide-react';

export default function VideosTab({ videos, onReprocess, liveStats }) {
  const [selectedVideo, setSelectedVideo] = useState(null);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats Cards */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 tracking-tight">Videos & Output Review</h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time pipeline queue, output video preview, and incident detection metrics.
          </p>
        </div>
      </div>

      {/* Videos List Table */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/60 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              <tr>
                <th className="py-3.5 px-4">Video File</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Progress / FPS</th>
                <th className="py-3.5 px-4">Incidents</th>
                <th className="py-3.5 px-4">Uploaded</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[12px]">
              {videos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-sans">
                    No videos uploaded yet. Go to the Upload tab to add footage.
                  </td>
                </tr>
              ) : (
                videos.map((vid) => {
                  const stats = liveStats[vid.id] || {};
                  const isProcessing = vid.status === 'processing';
                  const processedFrames = stats.processed_frames || vid.processed_frames || 0;
                  const totalFrames = stats.total_frames || vid.total_frames || 0;
                  const pct = totalFrames > 0 ? Math.round((processedFrames / totalFrames) * 100) : 0;
                  const incidentsCount = stats.detected_incidents !== undefined ? stats.detected_incidents : (vid.detected_incidents || 0);

                  return (
                    <tr key={vid.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-sans font-medium text-slate-200">
                        <div className="flex items-center gap-2.5">
                          <Film className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="truncate max-w-xs">{vid.filename}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-sans">
                        {getStatusBadge(vid.status)}
                      </td>
                      <td className="py-3.5 px-4">
                        {isProcessing ? (
                          <div className="space-y-1 w-36 font-sans">
                            <div className="flex justify-between text-[11px] text-slate-400">
                              <span>{processedFrames}/{totalFrames || '?'}</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-cyan-400 transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-sans">
                            {vid.processed_frames ? `${vid.processed_frames} frames` : '-'}
                            {vid.fps ? ` • ${vid.fps} FPS` : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {incidentsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-semibold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            <AlertTriangle className="w-3.5 h-3.5" /> {incidentsCount}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-sans text-[11px]">
                        {new Date(vid.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-sans space-x-2">
                        {vid.status === 'completed' && (
                          <button
                            onClick={() => setSelectedVideo(vid)}
                            className="px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" /> Output
                          </button>
                        )}
                        <button
                          onClick={() => onReprocess(vid.id)}
                          disabled={isProcessing}
                          className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Re-run
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Output Video Review Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-4xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Annotated Output Review: {selectedVideo.filename}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Full YOLOv8 bounding boxes, track IDs, and top-right HUD `Assoc (Trash, Person)` overlay.
                </p>
              </div>
              <button
                onClick={() => setSelectedVideo(null)}
                className="text-slate-400 hover:text-slate-200 text-xs px-2.5 py-1 rounded bg-slate-800"
              >
                Close (Esc)
              </button>
            </div>

            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-800">
              <video
                controls
                autoPlay
                src={`/media/output/${selectedVideo.id}.mp4`}
                className="w-full h-full object-contain"
              >
                Your browser does not support HTML5 video playback.
              </video>
            </div>

            <div className="flex justify-between items-center text-xs text-slate-400 pt-2">
              <span className="font-mono">
                Duration: {((selectedVideo.duration_ms || 0) / 1000).toFixed(1)}s • FPS: {selectedVideo.fps || '-'}
              </span>
              <a
                href={`/media/output/${selectedVideo.id}.mp4`}
                download
                className="text-cyan-400 hover:underline inline-flex items-center gap-1"
              >
                Download Output Video
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
