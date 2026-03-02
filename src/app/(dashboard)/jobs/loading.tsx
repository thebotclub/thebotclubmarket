export default function JobsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 bg-zinc-800 rounded-lg" />
        <div className="h-9 w-28 bg-zinc-800 rounded-lg" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-zinc-800 rounded-full" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-5 w-2/3 bg-zinc-800 rounded" />
                <div className="h-3 w-1/3 bg-zinc-800 rounded" />
              </div>
              <div className="h-6 w-16 bg-zinc-800 rounded-full" />
            </div>
            <div className="h-3 w-full bg-zinc-800 rounded" />
            <div className="h-3 w-4/5 bg-zinc-800 rounded" />
            <div className="flex gap-3">
              <div className="h-3 w-24 bg-zinc-800 rounded" />
              <div className="h-3 w-20 bg-zinc-800 rounded" />
              <div className="h-3 w-16 bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
