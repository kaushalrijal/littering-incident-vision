import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ currentPage, totalPages, total, onPageChange }) {
  if (totalPages <= 1) return null;

  const getVisiblePages = () => {
    const pages = [];
    const delta = 2;
    const left = Math.max(2, currentPage - delta);
    const right = Math.min(totalPages - 1, currentPage + delta);

    pages.push(1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);

    return pages;
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[#E2E7E2]">
      <p className="text-[12px] text-[#647067]">
        {total} total
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg border border-[#E2E7E2] bg-white text-[#647067] hover:bg-[#EEF1EC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {getVisiblePages().map((page, i) =>
          page === '...' ? (
            <span key={`dots-${i}`} className="px-1.5 text-[12px] text-[#8A948D]">
              ...
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[12px] font-medium transition-colors duration-150 ${
                currentPage === page
                  ? 'bg-[#1F4D3A] text-white'
                  : 'border border-[#E2E7E2] bg-white text-[#647067] hover:bg-[#EEF1EC]'
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
          className="p-1.5 rounded-lg border border-[#E2E7E2] bg-white text-[#647067] hover:bg-[#EEF1EC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
