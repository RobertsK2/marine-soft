import styles from "@/components/public-booking/booking-confirmation.module.css";

export default function ConfirmationNotFound() {
  return <main className={styles.page}><div className={styles.content}><section className={styles.hero}><div className={styles.success} style={{ paddingTop: 36 }}>
    <h1>Booking unavailable</h1>
    <p>This confirmation link is missing, invalid, or no longer accessible. Check your original booking link or contact the marina.</p>
  </div></section></div></main>;
}
