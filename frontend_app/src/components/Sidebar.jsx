import { ROUTES, navigate, usePath } from '../lib/router';

const NAV_ITEMS = [
  { id: 'upload', path: '/', label: 'Upload' },
  { id: 'videos', path: '/videos', label: 'Videos', watch: 'processing' },
  { id: 'incidents', path: '/incidents', label: 'Incidents' },
  { id: 'review', path: '/review', label: 'Review' },
  { id: 'live', path: '/live', label: 'Live camera' },
];

export default function Sidebar({ wsConnected, processingCount }) {
  const path = usePath();
  const activeTab = ROUTES[path] ?? 'upload';

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar select-none">
      <p className="label-micro border-b border-border px-6 py-8">Menu</p>

      <nav className="flex flex-col">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`flex w-full cursor-pointer items-center justify-between px-6 py-4 text-left text-[13px] font-bold tracking-[0.08em] uppercase transition-colors ${
                isActive
                  ? 'bg-foreground text-background'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              {item.label}
              {item.watch === 'processing' && processingCount > 0 && (
                <span
                  className={`grid h-5 min-w-5 place-items-center border px-1 font-mono text-[10px] ${
                    isActive
                      ? 'border-background/40'
                      : 'animate-pulse border-destructive text-destructive'
                  }`}
                >
                  {processingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border p-6 pb-7">
        <p className="label-micro">Status</p>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 ${wsConnected ? 'animate-pulse bg-success' : 'bg-destructive'}`}
          />
          <span className="text-xs text-muted-foreground">
            Socket {wsConnected ? 'connected' : 'down'}
          </span>
        </div>
      </div>
    </aside>
  );
}
