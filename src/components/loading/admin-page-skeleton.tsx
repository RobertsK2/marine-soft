import type { ReactNode } from "react";
import { SkeletonBadge, SkeletonButton, SkeletonCard, SkeletonField, SkeletonSummary, SkeletonTableRows, SkeletonText } from "./skeleton";
import styles from "./skeleton.module.css";

export type AdminLoadingPage = "overview" | "bookings" | "booking-detail" | "new-booking" | "map" | "berths" | "new-berth" | "berth-detail" | "edit-berth" | "payments" | "settings" | "general" | "pricing" | "cancellation-policy" | "integrations" | "publishing" | "audit" | "import";

function Toolbar({ count = 4 }: { count?: number }) {
  return <div className={styles.toolbar}>{Array.from({ length: count }, (_, i) => <SkeletonField key={i} />)}</div>;
}

function Footer() {
  return <div className={styles.footer}><SkeletonText width="25%" /><div className={styles.actions}><SkeletonButton /><SkeletonButton /></div></div>;
}

function FormCard({ fields = 4, columns = 2 }: { fields?: number; columns?: 2 | 3 }) {
  return <SkeletonCard><SkeletonText width="35%" /><div className={columns === 3 ? styles.threeFields : styles.fields}>
    {Array.from({ length: fields }, (_, i) => <SkeletonField key={i} />)}
  </div></SkeletonCard>;
}

function Rows({ count, icons = false, statuses = false }: { count: number; icons?: boolean; statuses?: boolean }) {
  return <div className={styles.rows}>{Array.from({ length: count }, (_, i) => <div className={styles.row} key={i}>
    {icons ? <span className={`${styles.bone} ${styles.icon}`} /> : null}
    <div className={styles.copy}><SkeletonText width="40%" /><SkeletonText width="75%" /></div>
    {statuses ? <SkeletonBadge /> : null}
  </div>)}</div>;
}

function MapPanel() {
  return <SkeletonCard className={styles.mapCard}><div className={styles.footer}><SkeletonText width="30%" /><SkeletonButton /></div><div className={`${styles.bone} ${styles.map}`} /><SkeletonText width="65%" /></SkeletonCard>;
}

function Detail({ booking = false }: { booking?: boolean }) {
  return <div className={styles.split}><div className={styles.stack}>
    <SkeletonCard><SkeletonText width="40%" /><div className={styles.threeFields}>{Array.from({ length: booking ? 6 : 9 }, (_, i) => <div className={styles.copy} key={i}><SkeletonText width="70%" /><SkeletonText width="40%" /></div>)}</div></SkeletonCard>
    <SkeletonCard><SkeletonText width="35%" /><Rows count={booking ? 2 : 1} statuses /></SkeletonCard>
    <SkeletonCard><SkeletonText width="35%" /><Rows count={3} /></SkeletonCard>
  </div><div className={styles.stack}><SkeletonCard><SkeletonText width="55%" /><SkeletonBadge /><Rows count={2} /><SkeletonButton /></SkeletonCard>{booking ? <SkeletonCard><Rows count={2} /><SkeletonButton /></SkeletonCard> : null}</div></div>;
}

function Content({ page }: { page: AdminLoadingPage }): ReactNode {
  switch (page) {
    case "overview": return <><SkeletonSummary cards tall /><div className={styles.overviewColumns}><MapPanel /><SkeletonCard><SkeletonText width="40%" /><Rows count={6} /><Footer /></SkeletonCard></div></>;
    case "map": return <><SkeletonSummary count={5} cards /><MapPanel /></>;
    case "bookings": return <><SkeletonSummary count={3} cards /><Toolbar /><SkeletonCard className={styles.tableCard}><SkeletonTableRows columns={7} /><Footer /></SkeletonCard></>;
    case "berths": return <><SkeletonSummary count={5} /><Toolbar count={3} /><SkeletonCard className={styles.tableCard}><SkeletonTableRows columns={7} /><Footer /></SkeletonCard></>;
    case "payments": return <><SkeletonSummary count={4} /><Toolbar /><SkeletonCard className={styles.tableCard}><SkeletonTableRows columns={8} /><Footer /></SkeletonCard></>;
    case "audit": return <><Toolbar count={4} /><SkeletonCard className={styles.tableCard}><SkeletonTableRows columns={5} rows={10} /><Footer /></SkeletonCard></>;
    case "booking-detail": return <Detail booking />;
    case "berth-detail": return <Detail />;
    case "new-booking": return <div className={`${styles.split} ${styles.bookingForm}`}><div className={styles.stack}><FormCard fields={3} columns={3} /><FormCard fields={6} columns={3} /><FormCard fields={4} /></div><SkeletonCard><SkeletonText width="55%" /><Rows count={3} /><SkeletonButton /></SkeletonCard></div>;
    case "new-berth": return <div className={styles.split}><div className={styles.stack}><FormCard fields={2} /><FormCard fields={3} columns={3} /><FormCard fields={4} /><Footer /></div><SkeletonCard><SkeletonText width="55%" /><Rows count={4} /></SkeletonCard></div>;
    case "edit-berth": return <><FormCard fields={9} columns={3} /><Footer /></>;
    case "settings": return <div className={styles.hub}>{Array.from({ length: 6 }, (_, i) => <SkeletonCard className={styles.hubCard} key={i}><Rows count={1} icons /></SkeletonCard>)}</div>;
    case "integrations": return <SkeletonCard className={styles.tableCard}>{Array.from({ length: 4 }, (_, i) => <div className={styles.integration} key={i}><Rows count={1} icons statuses /></div>)}<Footer /></SkeletonCard>;
    case "publishing": return <SkeletonCard className={styles.tableCard}><div className={styles.section}><SkeletonText width="30%" /><div className={styles.footer}><SkeletonText width="65%" /><SkeletonButton /></div></div><div className={styles.section}><div className={styles.footer}><SkeletonText width="30%" /><SkeletonBadge /></div><Rows count={5} statuses /></div><div className={styles.section}><SkeletonText width="30%" /><SkeletonText width="70%" /><SkeletonButton /></div><Footer /></SkeletonCard>;
    case "general": return <div className={styles.formSections}><FormCard fields={4} /><FormCard fields={4} /><FormCard fields={2} /><Footer /></div>;
    case "pricing": return <><FormCard fields={3} columns={3} /><SkeletonCard><SkeletonText width="30%" /><Rows count={3} /><SkeletonButton /></SkeletonCard><FormCard fields={3} columns={3} /><Footer /></>;
    case "cancellation-policy": return <><FormCard fields={2} /><SkeletonCard><SkeletonText width="30%" /><Rows count={3} /><SkeletonButton /></SkeletonCard><Footer /></>;
    // Initial navigation has no file or preview yet. Do not imply an uploaded file.
    case "import": return <><div className={styles.steps}><SkeletonBadge /><SkeletonBadge /><SkeletonBadge /></div><SkeletonCard><SkeletonText width="25%" /><SkeletonText width="70%" /><div className={styles.upload}><SkeletonButton /><SkeletonText width="45%" /><SkeletonButton /></div><Footer /></SkeletonCard></>;
  }
}

export function AdminPageSkeleton({ page }: { page: AdminLoadingPage }) {
  const topbar = ["overview", "bookings", "map"].includes(page);
  const settings = ["general", "pricing", "cancellation-policy", "integrations", "publishing", "audit", "berth-detail", "import"].includes(page);
  const roomy = ["general", "pricing", "publishing", "cancellation-policy"].includes(page);
  return <main className={`${styles.page} ${settings || page === "berths" ? styles.settingsPage : ""} ${roomy ? styles.roomy : ""}`} aria-busy="true" aria-label={`Loading ${page.replaceAll("-", " ")}`} data-loading-page={page}>
    <span className={styles.srOnly} role="status">Loading page content</span>
    <div aria-hidden="true" className={styles.stack}>
      {!topbar ? <div className={styles.breadcrumb}><SkeletonText width={180} /></div> : null}
      {settings ? <SkeletonText width={110} /> : null}
      <div className={styles.heading}><div className={styles.copy}><SkeletonText width={220} heading /><SkeletonText width="65%" /></div><SkeletonButton /></div>
      <Content page={page} />
    </div>
  </main>;
}
