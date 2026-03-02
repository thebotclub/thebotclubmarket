export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-zinc-800 rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
            <div className="h-4 w-24 bg-zinc-800 rounded" />
            <div className="h-8 w-16 bg-zinc-800 rounded" />
            <div className="h-3 w-32 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-zinc-800 rounded-lg" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-3/4 bg-zinc-800 rounded" />
                <div className="h-3 w-1/2 bg-zinc-800 rounded" />
              </div>
            </div>
            <div className="h-3 w-full bg-zinc-800 rounded" />
            <div className="h-3 w-5/6 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
