export default function DashboardLoading() {
  return (
    <div className="space-y-6 max-w-6xl animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-card border border-border rounded-lg" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="h-64 bg-card border border-border rounded-lg" />
        <div className="h-64 bg-card border border-border rounded-lg" />
      </div>
    </div>
  );
}
