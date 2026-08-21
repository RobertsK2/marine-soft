export default function DashboardLoading() {
  return (
    <main className="app-placeholder app-placeholder-wide" aria-busy="true" aria-label="Loading marina overview">
      <p className="eyebrow">Berthio operations</p>
      <h1>Loading overview</h1>
      <div className="overview-loading" aria-hidden="true">
        <span />
        <span />
      </div>
    </main>
  );
}
