import React, { useState } from 'react';
import { ChevronLeft, Loader2, Check, X, Clock, Camera, Play } from 'lucide-react';

function formatTimestamp(ms) {
  var totalSec = Math.floor((ms || 0) / 1000);
  var h = Math.floor(totalSec / 3600);
  var m = Math.floor((totalSec % 3600) / 60);
  var s = totalSec % 60;
  if (h > 0) {
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function getObjectLabel(inc) {
  if (inc.class_names) {
    try {
      var parsed = typeof inc.class_names === 'string' ? JSON.parse(inc.class_names) : inc.class_names;
      if (Array.isArray(parsed) && parsed.length) return parsed[0];
      if (typeof parsed === 'string') return parsed;
    } catch (e) {
      if (typeof inc.class_names === 'string' && !inc.class_names.startsWith('[')) return inc.class_names;
    }
  }
  var match = (inc.reason || '').match(/waste object '([^']+)'/i);
  return match ? match[1] : 'Waste object';
}

function StatusDot({ status }) {
  var cfg = {
    confirmed: { color: 'bg-[#3E7C59]', label: 'Confirmed' },
    false_alarm: { color: 'bg-[#C94A4A]', label: 'False alarm' },
    pending: { color: 'bg-[#C58B2A]', label: 'Pending' },
  };
  var c = cfg[status] || cfg.pending;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#647067]">
      <span className={'w-1.5 h-1.5 rounded-full ' + c.color} />
      {c.label}
    </span>
  );
}

function RuleStepsCompact() {
  var steps = [
    { key: 'N', label: 'Near' },
    { key: 'R', label: 'Released' },
    { key: 'S', label: 'Stationary' },
    { key: 'M', label: 'Moved away' },
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {steps.map(function(step, i) {
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center">
              <span className="w-6 h-6 rounded bg-[#1F4D3A] text-white flex items-center justify-center text-[10px] font-bold leading-none">{step.key}</span>
              <span className="text-[8px] text-[#8A948D] mt-0.5 leading-none text-center">{step.label}</span>
            </div>
            {i < steps.length - 1 && <span className="text-[#C0C5C1] text-[9px] self-start mt-1">&rarr;</span>}
          </React.Fragment>
        );
      })}
      <span className="text-[#C0C5C1] text-[9px] self-start mt-1 mx-0.5">=</span>
      <div className="flex flex-col items-center">
        <span className="w-6 h-6 rounded bg-[#C58B2A] text-white flex items-center justify-center text-[10px] font-bold leading-none">L</span>
        <span className="text-[8px] text-[#C58B2A] mt-0.5 leading-none text-center font-semibold">Littering</span>
      </div>
    </div>
  );
}

export default function VideoReview({ videoName, incidents, onBack, onUpdateStatus }) {
  var _s = useState(null);
  var loadingId = _s[0], setLoadingId = _s[1];
  var _t = useState(null);
  var toast = _t[0], setToast = _t[1];

  var reviewed = incidents.filter(function(i) { return i.review_status !== 'pending'; }).length;
  var pendingCount = incidents.length - reviewed;

  function showToast(msg, type) {
    setToast({ msg: msg, type: type });
    setTimeout(function() { setToast(null); }, 2000);
  }

  function handleStatus(incId, status) {
    setLoadingId(incId);
    onUpdateStatus(incId, status).then(function() {
      var msg = status === 'confirmed' ? 'Incident confirmed' : status === 'false_alarm' ? 'Marked as false alarm' : 'Marked as pending';
      showToast(msg, status);
    }).finally(function() {
      setLoadingId(null);
    });
  }

  var firstClip = incidents.find(function(inc) { return inc.clip_path; });

  return (
    <div className="max-w-[1000px] mx-auto space-y-6">
      {toast && (
        <div className="fixed top-5 right-5 z-50 px-4 py-2.5 rounded-lg text-[13px] font-medium shadow-lg"
          style={{ backgroundColor: toast.type === 'confirmed' ? '#3E7C59' : toast.type === 'false_alarm' ? '#C94A4A' : '#26312B', color: 'white' }}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-[#EEF1EC] text-[#647067] hover:text-[#26312B] transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-[17px] font-semibold text-[#26312B] leading-tight">{videoName}</h2>
            <p className="text-[12px] text-[#647067] mt-0.5">
              {incidents.length} incident{incidents.length !== 1 ? 's' : ''} &middot; {pendingCount} pending review
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-[#8A948D]">{reviewed} of {incidents.length} reviewed</p>
          <div className="w-24 h-1 bg-[#E2E7E2] rounded-full overflow-hidden mt-1.5">
            <div className="h-full bg-[#3E7C59] rounded-full transition-all"
              style={{ width: (incidents.length > 0 ? (reviewed / incidents.length) * 100 : 0) + '%' }} />
          </div>
        </div>
      </div>

      {firstClip && (
        <div className="rounded-xl border border-[#E2E7E2] bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-6 h-6 rounded bg-[#EAF2EC] flex items-center justify-center">
              <Play className="w-3 h-3 text-[#1F4D3A]" fill="#1F4D3A" />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[#26312B] leading-tight">Evidence clip</p>
              <p className="text-[10px] text-[#8A948D]">A few seconds around the detected event</p>
            </div>
          </div>
          <div className="max-w-[860px] mx-auto">
            <video
              controls
              className="w-full rounded-lg bg-[#0a0f0c]"
              style={{ aspectRatio: '16 / 9' }}
              src={'/media/' + firstClip.clip_path}
            />
          </div>
        </div>
      )}

      <div className="space-y-4">
        {incidents.map(function(inc, idx) {
          var objectLabel = getObjectLabel(inc);
          var conf = Math.round((inc.confidence || 0) * 100);
          var isLoading = loadingId === inc.id;

          return (
            <div key={inc.id} className="rounded-xl border border-[#E2E7E2] bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#E2E7E2] flex items-center justify-between bg-[#F6F7F3]/60">
                <div className="flex items-center gap-2.5">
                  <span className="text-[13px] font-semibold text-[#26312B]">Incident {idx + 1}</span>
                  <StatusDot status={inc.review_status} />
                </div>
                <span className="text-[11px] font-mono text-[#8A948D]">{formatTimestamp(inc.timestamp_ms)}</span>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
                  <div className="space-y-2">
                    {inc.snapshot_path ? (
                      <img
                        src={'/media/' + inc.snapshot_path}
                        alt={'Incident ' + (idx + 1) + ' snapshot'}
                        className="w-full rounded-lg border border-[#E2E7E2] bg-[#1a221e] object-contain"
                      />
                    ) : (
                      <div className="w-full aspect-video bg-[#1a221e] rounded-lg flex items-center justify-center text-[12px] text-[#8A948D]">
                        <Camera className="w-5 h-5 mr-2" /> No snapshot available
                      </div>
                    )}
                    {inc.clip_path && (
                      <a href={'/media/' + inc.clip_path} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] text-[#1F4D3A] hover:underline font-medium">
                        <Play className="w-3 h-3" /> Play evidence clip
                      </a>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-[12px] font-semibold text-[#26312B] uppercase tracking-wide">Suspected littering</p>
                      <p className="text-[14px] font-semibold text-[#26312B] mt-1 capitalize">{objectLabel}</p>
                      <p className="text-[12px] text-[#647067]">{conf}% confidence</p>
                    </div>

                    <div className="space-y-1.5 text-[12px]">
                      <div className="flex justify-between py-1 border-b border-[#E2E7E2]/70">
                        <span className="text-[#8A948D]">Timestamp</span>
                        <span className="font-mono font-medium text-[#26312B]">{formatTimestamp(inc.timestamp_ms)}</span>
                      </div>
                      {inc.track_id != null && (
                        <div className="flex justify-between py-1 border-b border-[#E2E7E2]/70">
                          <span className="text-[#8A948D]">Track ID</span>
                          <span className="font-medium text-[#26312B]">#{inc.track_id}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold text-[#8A948D] uppercase tracking-wide mb-1.5">Event reasoning</p>
                      <RuleStepsCompact />
                    </div>

                    {inc.reason && (
                      <div className="bg-[#F6F7F3] rounded-lg p-2.5">
                        <p className="text-[10px] font-semibold text-[#8A948D] uppercase tracking-wide mb-1">Detail</p>
                        <p className="text-[11px] text-[#647067] leading-relaxed">{inc.reason}</p>
                      </div>
                    )}

                    <div className="space-y-2 pt-1">
                      <button type="button" onClick={function() { handleStatus(inc.id, 'confirmed'); }}
                        disabled={isLoading}
                        className="w-full px-3 py-2 rounded-lg bg-[#3E7C59] hover:bg-[#34684A] text-white text-[12px] font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Confirm littering
                      </button>
                      <button type="button" onClick={function() { handleStatus(inc.id, 'false_alarm'); }}
                        disabled={isLoading}
                        className="w-full px-3 py-2 rounded-lg border border-[#E2E7E2] bg-white hover:bg-[#FBECEC] text-[#C94A4A] text-[12px] font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        False alarm
                      </button>
                      <button type="button" onClick={function() { handleStatus(inc.id, 'pending'); }}
                        disabled={isLoading}
                        className="w-full px-3 py-2 rounded-lg border border-[#E2E7E2] bg-white hover:bg-[#EEF1EC] text-[#647067] text-[12px] font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                        Mark pending
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
