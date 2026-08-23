import { AlertTriangle, X } from 'lucide-react';
import { navigate } from '../lib/router';

/**
 * Fixed top-right stack of live-incident notifications.
 *
 * Purely presentational: toasts come in as
 *   { id, message, confidence, incidentId }
 * and every removal flows through onDismiss so owners control lifetimes.
 */
export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed top-5 right-5 z-50 flex w-[21rem] max-w-[calc(100vw-2.5rem)] flex-col gap-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className="animate-toast-in pointer-events-auto border border-border border-l-4 border-l-destructive bg-card shadow-lg"
        >
          <div className="flex items-start gap-2.5 p-3.5 pb-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" strokeWidth={2.5} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs leading-none font-black tracking-[0.08em] uppercase">
                  Littering detected
                </p>
                {typeof t.confidence === 'number' && (
                  <span className="shrink-0 bg-destructive px-1.5 py-0.5 font-mono text-[10px] leading-none font-bold text-white tabular-nums">
                    {Math.round(t.confidence * 100)}%
                  </span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {t.message}
              </p>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="-m-1 shrink-0 cursor-pointer p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-border bg-sidebar px-3.5 py-2">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t.incidentId != null ? `Incident #${t.incidentId} saved` : 'Saved for review'}
            </span>
            <button
              onClick={() => {
                onDismiss(t.id);
                navigate('/incidents');
              }}
              className="cursor-pointer font-mono text-[10px] leading-none font-bold tracking-wider uppercase underline underline-offset-2 hover:text-destructive"
            >
              Review
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
