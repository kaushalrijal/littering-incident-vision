import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ currentPage, totalPages, total, onPageChange }) {
  if (totalPages <= 1) return null;

  const getVisiblePages = () => {
    const pages = [];
    const delta = 2;
    const left = Math.max(2, currentPage - delta);
    const right = Math.min(totalPages - 1, currentPage + delta);

    pages.push(1);
    if (left > 2) pages.push('…');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('…');
    if (totalPages > 1) pages.push(totalPages);

    return pages;
  };

  const arrowClass =
    'grid h-7 w-7 cursor-pointer place-items-center border border-border bg-card text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40';

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
      <p className="font-mono text-[11px] text-muted-foreground uppercase">{total} total</p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={arrowClass}
          title="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {getVisiblePages().map((page, i) =>
          page === '…' ? (
            <span key={`dots-${i}`} className="px-1 font-mono text-[11px] text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={`grid h-7 min-w-7 cursor-pointer place-items-center border px-1.5 font-mono text-[11px] font-bold tabular-nums transition-colors ${
                currentPage === page
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-foreground hover:border-foreground'
              }`}
            >
              {page}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={arrowClass}
          title="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
