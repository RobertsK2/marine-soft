import type { CSSProperties, ReactNode } from "react";
import styles from "./skeleton.module.css";

export function SkeletonText({ width = "100%", heading = false }: { width?: CSSProperties["width"]; heading?: boolean }) {
  return <span aria-hidden="true" className={`${styles.bone} ${heading ? styles.title : styles.text}`} style={{ width }} />;
}

export function SkeletonButton() {
  return <span aria-hidden="true" className={`${styles.bone} ${styles.button}`} />;
}

export function SkeletonBadge() {
  return <span aria-hidden="true" className={`${styles.bone} ${styles.badge}`} />;
}

export function SkeletonField() {
  return <div className={styles.field} aria-hidden="true"><SkeletonText width="42%" /><span className={`${styles.bone} ${styles.input}`} /></div>;
}

export function SkeletonCard({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div aria-hidden="true" className={`${styles.card} ${className}`}>{children ?? <><SkeletonText width="45%" /><SkeletonText /><SkeletonText width="70%" /></>}</div>;
}

export function SkeletonSummary({ count = 4, cards = false, tall = false }: { count?: number; cards?: boolean; tall?: boolean }) {
  return <div aria-hidden="true" className={`${styles.summary} ${cards ? styles.summaryCards : ""} ${tall ? styles.tallSummary : ""}`} style={{ "--columns": count } as CSSProperties}>
    {Array.from({ length: count }, (_, index) => <div key={index}><SkeletonText width="65%" /><SkeletonText width="35%" heading={cards} /></div>)}
  </div>;
}

export function SkeletonTableRows({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return <div aria-hidden="true" className={styles.tableScroll}><div className={styles.table} style={{ "--columns": columns } as CSSProperties}>
    <div className={styles.tableHead}>{Array.from({ length: columns }, (_, column) => <SkeletonText key={column} width="65%" />)}</div>
    {Array.from({ length: rows }, (_, row) => <div className={styles.tableRow} key={row}>
      {Array.from({ length: columns }, (_, column) => column === columns - 1 ? <SkeletonBadge key={column} /> : <SkeletonText key={column} width={column === 0 ? "60%" : "80%"} />)}
    </div>)}
  </div></div>;
}
