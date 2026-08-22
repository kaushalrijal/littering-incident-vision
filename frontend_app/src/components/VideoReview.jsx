import { useState } from 'react';
import { ChevronLeft, Loader2, Check, X, Clock, Camera, Play } from 'lucide-react';

function formatTimestamp(ms) {
  const totalSec = Math.floor((ms || 0) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function getObjectLabel(inc) {
  if (inc.class_names) {
    try {
      const parsed = typeof inc.class_names === 'string' ? JSON.parse(inc.class_names) : inc.class_names;
      if (Array.isArray(parsed) && parsed.length) return parsed[0];
      if (typeof parsed === 'string') return parsed;
    } catch {
      if (typeof inc.class_names === 'string' && !inc.class_names.startsWith('[')) return inc.class_names;
    }
  }
  const match = (inc.reason || '').match(/waste object '([^']+)'/i);
  return match ? match[1] : 'Waste object';
}

function StatusDot({ status }) {
  const cfg = {
    confirmed: { color: 'bg-success', label: 'Confirmed' },
    false_alarm: { color: 'bg-destructive', label: 'False alarm' },
    pending: { color: 'bg-muted-foreground', label: 'Pending' },
  };
  const c = cfg[status] || cfg.pending;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
      <span className={`h-1.5 w-1.5 ${c.color}`} />
      {c.label}
    </span>
  );
}

function RuleStepsCompact() {
  const steps = [
    { key: 'N', label: 'Near' },
    { key: 'R', label: 'Released' },
    { key: 'S', label: 'Stationary' },
    { key: 'M', label: 'Moved away' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-1.5">
          <div className="flex flex-col items-center">
            <span className="grid h-6 w-6 place-items-center border border-foreground text-[10px] leading-none font-bold">
              {step.key}
            </span>
            <span className="mt-1 text-center text-[8px] leading-none text-muted-foreground">{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <span className="mt-0.5 self-start font-mono text-[9px] text-muted-foreground">&rarr;</span>
          )}
        </div>
      ))}
      <span className="mt-0.5 mx-0.5 self-start font-mono text-[9px] text-muted-foreground">=</span>
      <div className="flex flex-col items-center">
        <span className="grid h-6 w-6 place-items-center bg-destructive text-[10px] leading-none font-bold text-white">
          L
        </span>
        <span className="mt-1 text-center text-[8px] leading-none font-semibold text-destructive">
          Littering
        </span>
      </div>
    </div>
  );
}

export default function VideoReview({ videoName, incidents, onBack, onUpdateStatus }) {
  const [loadingId, setLoadingId] = useState(null);
  const [toast, setToast] = useState(null);

  const reviewed = incidents.filter((inc) => inc.review_status !== 'pending').length;
  const pendingCount = incidents.length - reviewed;

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  }

  function handleStatus(incId, status) {
    setLoadingId(incId);
    onUpdateStatus(incId, status)
      .then(() => {
        const msg =
          status === 'confirmed'
            ? 'Incident confirmed'
            : status === 'false_alarm'
              ? 'Marked as false alarm'
              : 'Marked as pending';
        showToast(msg, status);
      })
      .catch((err) => console.error('Failed to update incident:', err))
      .finally(() => setLoadingId(null));
  }

  const firstClip = incidents.find((inc) => inc.clip_path);

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-foreground px-4 py-3 font-mono text-[11px] font-bold tracking-[0.08em] text-background uppercase shadow-lg">
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="btn btn-outline shrink-0 p-2"
            title="Back to video list"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black tracking-tight">{videoName}</h2>
            <p className="font-mono text-[11px] text-muted-foreground uppercase">
              {incidents.length} INCIDENT{incidents.length !== 1 ? 'S' : ''} · {pendingCount} PENDING
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[11px] text-muted-foreground uppercase">
            {reviewed} OF {incidents.length} REVIEWED
          </p>
          <div className="mt-1.5 h-1 w-24 bg-muted">
            <div
              className="h-full bg-foreground transition-all"
              style={{ width: (incidents.length > 0 ? (reviewed / incidents.length) * 100 : 0) + '%' }}
            />
          </div>
        </div>
      </div>

      {firstClip && (
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <Play className="h-3.5 w-3.5" />
              <div>
                <p className="text-xs font-bold tracking-[0.08em] uppercase">Evidence clip</p>
                <p className="text-[11px] text-muted-foreground">
                  A few seconds around the detected event
                </p>
              </div>
            </div>
          </div>
          <div className="mx-auto aspect-video max-w-[860px] overflow-hidden bg-black">
            <video controls className="h-full w-full object-contain" src={'/media/' + firstClip.clip_path} />
          </div>
        </div>
      )}

      <div className="space-y-4">
        {incidents.map((inc, idx) => {
          const objectLabel = getObjectLabel(inc);
          const conf = Math.round((inc.confidence || 0) * 100);
          const isLoading = loadingId === inc.id;

          return (
            <article key={inc.id} className="panel overflow-hidden">
              <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border bg-muted px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-bold">Incident {idx + 1}</span>
                  <StatusDot status={inc.review_status} />
                </div>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {formatTimestamp(inc.timestamp_ms)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1fr_300px]">
                <div className="space-y-2">
                  {inc.snapshot_path ? (
                    <img
                      src={'/media/' + inc.snapshot_path}
                      alt={'Incident ' + (idx + 1) + ' snapshot'}
                      className="w-full border border-border bg-black object-contain"
                    />
                  ) : (
                    <div className="grid aspect-video w-full place-items-center border border-border bg-black">
                      <span className="label-micro flex items-center gap-2">
                        <Camera className="h-4 w-4" /> No snapshot available
                      </span>
                    </div>
                  )}
                  {inc.clip_path && (
                    <a
                      href={'/media/' + inc.clip_path}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold underline underline-offset-2"
                    >
                      <Play className="h-3 w-3" /> Play evidence clip
                    </a>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="border-l-4 border-foreground pl-4">
                    <p className="label-micro">Suspected littering</p>
                    <p className="mt-1 text-sm font-bold capitalize">{objectLabel}</p>
                    <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {conf}% CONFIDENCE
                    </p>
                  </div>

                  <div className="divide-y divide-border border-y border-border font-mono text-[11px]">
                    <div className="flex justify-between py-2">
                      <span className="text-muted-foreground uppercase">Timestamp</span>
                      <span className="font-bold tabular-nums">{formatTimestamp(inc.timestamp_ms)}</span>
                    </div>
                    {inc.track_id != null && (
                      <div className="flex justify-between py-2">
                        <span className="text-muted-foreground uppercase">Track ID</span>
                        <span className="font-bold tabular-nums">#{inc.track_id}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="label-micro mb-1.5">Event reasoning</p>
                    <RuleStepsCompact />
                  </div>

                  {inc.reason && (
                    <div className="border-l-4 border-border pl-4">
                      <p className="label-micro mb-1">Detail</p>
                      <p className="text-xs leading-relaxed">{inc.reason}</p>
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleStatus(inc.id, 'confirmed')}
                      disabled={isLoading}
                      className={`btn w-full ${inc.review_status === 'confirmed' ? 'btn-solid' : 'btn-outline'}`}
                    >
                      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Confirm littering
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatus(inc.id, 'false_alarm')}
                      disabled={isLoading}
                      className={`btn w-full ${
                        inc.review_status === 'false_alarm' ? 'btn-danger-active' : 'btn-danger-outline'
                      }`}
                    >
                      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      False alarm
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatus(inc.id, 'pending')}
                      disabled={isLoading}
                      className="btn btn-outline w-full"
                    >
                      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                      Mark pending
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
