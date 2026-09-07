import { Anchor } from "lucide-react";
import styles from "./skeleton.module.css";

export function InitialLoading() {
  return <div className={styles.initial} role="status" aria-label="Loading Berthio">
    <div className={styles.logo}><Anchor size={28} aria-hidden="true" /><span>Berthio</span></div>
    <span className={styles.indicator} aria-hidden="true" />
  </div>;
}
