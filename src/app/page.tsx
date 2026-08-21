import Link from "next/link";

export default function HomePage() {
  return (
    <main className="foundation-page">
      <section className="foundation-panel" aria-labelledby="home-title">
        <p className="foundation-kicker">Berthio / Foundation</p>
        <h1 id="home-title">Marina operations start here.</h1>
        <p>
          The technical foundation is ready. Berth, booking, and availability
          rules will be added in their dedicated milestone phases.
        </p>
        <Link className="button button-primary" href="/login">
          Staff login
        </Link>
      </section>
    </main>
  );
}
