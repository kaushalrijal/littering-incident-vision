import React from 'react';
import { Shield, Leaf } from 'lucide-react';

function BrandMark() {
  return (
    <div className="relative w-8 h-8 rounded-lg bg-[#1F4D3A] flex items-center justify-center text-white shrink-0">
      <Shield className="w-[18px] h-[18px]" strokeWidth={1.75} />
      <Leaf className="absolute bottom-1 right-1 w-2.5 h-2.5 text-[#EAF2EC]" strokeWidth={2.5} />
    </div>
  );
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  wsConnected,
  activeProcessingCount,
  open = false,
}) {
  const overviewItems = [
    {
      id: 'videos',
      label: 'Videos & Output',
      badge: activeProcessingCount > 0 ? activeProcessingCount : null,
    },
    { id: 'incidents', label: 'Incident Review' },
    { id: 'webcam', label: 'Real-Time Camera' },
  ];

  const systemItems = [{ id: 'upload', label: 'Upload Video' }];

  const renderNav = (items) =>
    items.map((item) => {
      const isActive = activeTab === item.id;
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => setActiveTab(item.id)}
          className={`relative w-full flex items-center justify-between pl-3 pr-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 ${
            isActive
              ? 'bg-[#EAF2EC] text-[#1F4D3A]'
              : 'text-[#647067] hover:text-[#26312B] hover:bg-[#EEF1EC]'
          }`}
        >
          {isActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[#3E7C59]" />
          )}
          <span>{item.label}</span>
          {item.badge != null && (
            <span className="min-w-[18px] h-[18px] px-1 text-[11px] font-semibold rounded-md bg-[#1F4D3A] text-white flex items-center justify-center">
              {item.badge}
            </span>
          )}
        </button>
      );
    });

  return (
    <aside
      className={`fixed lg:static inset-y-0 left-0 z-40 w-[232px] bg-white border-r border-[#E2E7E2] flex flex-col justify-between select-none transition-transform duration-200 ${
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div>
        <div className="h-[68px] flex items-center gap-2.5 px-4 border-b border-[#E2E7E2]">
          <BrandMark />
          <div className="min-w-0">
            <h1 className="font-semibold text-[14px] text-[#26312B] leading-tight truncate">
              LitterGuard AI
            </h1>
            <p className="text-[11px] text-[#8A948D] leading-tight mt-0.5 truncate">
              Real-Time Detection
            </p>
          </div>
        </div>

        <nav className="px-3 py-4 space-y-5">
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-wide text-[#8A948D] uppercase">
              Overview
            </p>
            <div className="space-y-0.5">{renderNav(overviewItems)}</div>
          </div>

          <div>
            <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-wide text-[#8A948D] uppercase">
              System
            </p>
            <div className="space-y-0.5">{renderNav(systemItems)}</div>
          </div>
        </nav>
      </div>

      <div className="p-4 border-t border-[#E2E7E2]">
        <div className="flex items-center gap-2 text-[12px] text-[#647067]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsConnected ? 'bg-[#3E7C59]' : 'bg-[#C58B2A] lg-pulse'
            }`}
          />
          <span>{wsConnected ? 'Connected' : 'Connecting…'}</span>
        </div>
      </div>
    </aside>
  );
}
