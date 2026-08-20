import React, { useState } from 'react';
import { Film, Loader2, AlertTriangle, Camera } from 'lucide-react';

function StatusDot({ status }) {
  const config = {
    completed: { label: 'Completed', color: 'bg-[#3E7C59]', pulse: false },
    processing: { label: 'Processing', color: 'bg-[#4D7185]', pulse: true },
    failed: { label: 'Failed', color: 'bg-[#C94A4A]', pulse: false },
    queued: { label: 'Queued', color: 'bg-[#8A948D]', pulse: false },
    pending: { label: 'Queued', color: 'bg-[#8A948D]', pulse: false },
  };
  const item = config[status] || config.pending;

  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-[#26312B]">
      <span className={`w-1.5 h-1.5 rounded-full ${item.color} ${item.pulse ? 'lg-pulse' : ''}`} />
      {item.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, hint, accent }) {
  return (
    <div className="lg-card p-4 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] text-[#647067] font-medium">{label}</p>
          <p className="text-[24px] font-semibold text-[#26312B] mt-1 leading-none">{value}</p>
          <p className="text-[12px] text-[#8A948D] mt-1.5">{hint}</p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-[#EAF2EC] flex items-center justify-center text-[#1F4D3A]">
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

export default function VideosTab({ videos, incidents = [], onReprocess, liveStats, onGoUpload }) {
  const [selectedVideo, setSelectedVideo] = useState(null);

  const processingCount = videos.filter((v) => v.status === 'processing').length;
  const completedCount = videos.filter((v) => v.status === 'completed').length;
  const incidentCount = incidents.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-semibold text-[#26312B] tracking-tight">Videos & Output</h2>
          <p className="text-[14px] text-[#647067] mt-1.5">
            Monitor uploaded footage, processing progress and detected events.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoUpload}
          className="inline-flex items-center self-start px-3.5 py-2 rounded-lg bg-[#1F4D3A] hover:bg-[#183D2E] text-white text-[13px] font-medium transition-colors duration-150"
        >
          + Upload Video
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={Film}
          label="Videos"
          value={videos.length}
          hint="uploaded"
          accent="bg-[#3E7C59]"
        />
        <StatCard
          icon={Loader2}
          label="Processing"
          value={processingCount}
          hint="active"
          accent="bg-[#4D7185]"
        />
        <StatCard
          icon={AlertTriangle}
          label="Incidents"
          value={incidentCount}
          hint="detected"
          accent="bg-[#C58B2A]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Processing', value: processingCount, color: 'text-[#4D7185] bg-[#EEF1EC]' },
          { label: 'Completed', value: completedCount, color: 'text-[#3E7C59] bg-[#EAF2EC]' },
          { label: 'Incidents', value: incidentCount, color: 'text-[#C58B2A] bg-[#FBF6EB]' },
        ].map((chip) => (
          <span
            key={chip.label}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium ${chip.color}`}
          >
            {chip.label}
            <span className="font-semibold">{chip.value}</span>
          </span>
        ))}
      </div>

      <div className="lg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E7E2] flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[#26312B]">Video processing</h3>
          <span className="text-[12px] text-[#8A948D]">{videos.length} total</span>
        </div>

        {videos.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <div className="w-11 h-11 mx-auto mb-3 rounded-xl bg-[#EAF2EC] border border-[#E2E7E2] flex items-center justify-center text-[#1F4D3A]">
              <Camera className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <p className="text-[15px] font-medium text-[#26312B]">No videos yet</p>
            <p className="text-[13px] text-[#647067] mt-1 max-w-sm mx-auto">
              Upload CCTV or public-space footage to begin detection.
            </p>
            <button
              type="button"
              onClick={onGoUpload}
              className="mt-4 inline-flex items-center px-3.5 py-2 rounded-lg bg-[#1F4D3A] hover:bg-[#183D2E] text-white text-[13px] font-medium transition-colors duration-150"
            >
              Upload Video
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#E2E7E2] text-[12px] text-[#647067] font-medium bg-[#F6F7F3]/70">
                  <th className="py-3 px-4 font-medium">Video</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Progress</th>
                  <th className="py-3 px-4 font-medium">FPS</th>
                  <th className="py-3 px-4 font-medium">Incidents</th>
                  <th className="py-3 px-4 font-medium">Uploaded</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((vid, idx) => {
                  const stats = liveStats[vid.id] || {};
                  const isProcessing = vid.status === 'processing';
                  const processedFrames = stats.processed_frames || vid.processed_frames || 0;
                  const totalFrames = stats.total_frames || vid.total_frames || 0;
                  const pct = totalFrames > 0 ? Math.round((processedFrames / totalFrames) * 100) : 0;
                  const incidentsCount =
                    stats.detected_incidents !== undefined
                      ? stats.detected_incidents
                      : vid.detected_incidents || 0;

                  return (
                    <tr
                      key={vid.id}
                      className={`border-b border-[#E2E7E2] last:border-b-0 transition-colors duration-150 hover:bg-[#EAF2EC]/50 ${
                        idx % 2 === 1 ? 'bg-[#F6F7F3]/40' : 'bg-white'
                      }`}
                    >
                      <td className="py-3.5 px-4 max-w-[240px]">
                        <p className="font-medium text-[#26312B] truncate">{vid.filename}</p>
                        <p className="text-[12px] text-[#8A948D] mt-0.5">
                          {totalFrames || vid.total_frames
                            ? `${totalFrames || vid.total_frames} frames`
                            : '—'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusDot status={vid.status} />
                      </td>
                      <td className="py-3.5 px-4 text-[#647067]">
                        {isProcessing ? (
                          <div className="space-y-1 w-36">
                            <div className="flex justify-between text-[12px]">
                              <span>
                                {processedFrames} / {totalFrames || '?'}
                              </span>
                              <span className="font-medium text-[#26312B]">{pct}%</span>
                            </div>
                            <div className="h-1 bg-[#EEF1EC] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#3E7C59] transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span>
                            {vid.processed_frames ? `${vid.processed_frames} frames` : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[#647067]">{vid.fps || '—'}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-medium ${
                            incidentsCount > 0 ? 'text-[#C58B2A]' : 'text-[#26312B]'
                          }`}
                        >
                          {incidentsCount}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[#647067] whitespace-nowrap">
                        {new Date(vid.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {vid.status === 'completed' && (
                            <button
                              type="button"
                              onClick={() => setSelectedVideo(vid)}
                              className="px-2.5 py-1.5 rounded-lg border border-[#E2E7E2] bg-white text-[#26312B] hover:bg-[#EEF1EC] text-[12px] font-medium transition-colors duration-150"
                            >
                              View
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onReprocess(vid.id)}
                            disabled={isProcessing}
                            className="px-2.5 py-1.5 rounded-lg border border-[#E2E7E2] bg-white text-[#26312B] hover:bg-[#EEF1EC] text-[12px] font-medium transition-colors duration-150 disabled:opacity-40"
                          >
                            Re-run
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedVideo && (
        <div className="fixed inset-0 z-50 bg-[#26312B]/40 flex items-center justify-center p-4">
          <div className="lg-card max-w-4xl w-full p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-[17px] font-semibold text-[#26312B] truncate">
                  {selectedVideo.filename}
                </h3>
                <p className="text-[13px] text-[#647067] mt-0.5">Annotated output preview</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVideo(null)}
                className="text-[13px] text-[#647067] hover:text-[#26312B] transition-colors duration-150"
              >
                Close
              </button>
            </div>

            <div className="aspect-video bg-[#1a221e] rounded-lg overflow-hidden">
              <video
                controls
                autoPlay
                src={`/media/output/${selectedVideo.id}.mp4`}
                className="w-full h-full object-contain"
              >
                Your browser does not support HTML5 video playback.
              </video>
            </div>

            <div className="flex justify-between items-center text-[13px] text-[#647067]">
              <span>
                Duration: {((selectedVideo.duration_ms || 0) / 1000).toFixed(1)}s · FPS:{' '}
                {selectedVideo.fps || '—'}
              </span>
              <a
                href={`/media/output/${selectedVideo.id}.mp4`}
                download
                className="text-[#1F4D3A] hover:underline font-medium"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
