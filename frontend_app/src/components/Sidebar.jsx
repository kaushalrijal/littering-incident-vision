import React from 'react';
import { 
  Upload, 
  Film, 
  AlertTriangle, 
  Camera, 
  ShieldCheck, 
  Activity,
  Radio
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, wsConnected, activeProcessingCount }) {
  const navItems = [
    { id: 'upload', label: 'Upload Video', icon: Upload },
    { 
      id: 'videos', 
      label: 'Videos & Output', 
      icon: Film,
      badge: activeProcessingCount > 0 ? activeProcessingCount : null
    },
    { id: 'incidents', label: 'Incident Review', icon: AlertTriangle },
    { id: 'webcam', label: 'Real-Time Camera', icon: Camera },
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800/80 flex flex-col justify-between select-none">
      {/* Brand Header */}
      <div>
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800/80 bg-slate-950/50">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-slate-100 tracking-tight">LitterGuard AI</h1>
            <p className="text-[11px] text-slate-400 font-mono">v1.0 • YOLOv8 + ByteTrack</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Workspace
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Connection & System Status */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 space-y-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-slate-400" />
            Live WebSockets
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
            wsConnected 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            {wsConnected ? 'Connected' : 'Connecting'}
          </span>
        </div>

        <div className="p-2.5 rounded-md bg-slate-900/80 border border-slate-800/60 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center justify-between text-slate-300 font-medium">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400" /> Engine
            </span>
            <span className="font-mono text-cyan-400">N ^ R ^ S ^ M</span>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-400">
            ByteTrack Stitching • Point-to-Box Proximity
          </p>
        </div>
      </div>
    </aside>
  );
}
