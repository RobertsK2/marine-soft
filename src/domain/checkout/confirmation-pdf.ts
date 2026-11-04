import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { getCheckoutReturnStatus } from "./service";
import type { PublicMarina } from "@/domain/public-marinas/types";
import { berthAssignmentLabel, confirmationMoney, confirmationPriceLines } from "./confirmation";
import { bookingNights, formatBookingDate, formatBookingTime, formatVesselName } from "@/domain/bookings/formatting";

type Payment = NonNullable<Awaited<ReturnType<typeof getCheckoutReturnStatus>>>;

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    // Long vessel names and URLs can also wrap without overflowing the page.
    for (const character of word) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

export async function createConfirmationPdf(payment: Payment, marina: PublicMarina) {
  if (payment.status !== "paid" || !payment.confirmation) throw new Error("A verified paid booking is required.");
  const booking = payment.confirmation;
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(await readFile(path.join(process.cwd(), "public/fonts/Geist-Regular.ttf")), { subset: true });
  document.setTitle(`Booking confirmation ${booking.reference}`);
  document.setAuthor("Berthio");
  function addPage() {
    const page = document.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(1, 1, 1) });
    return page;
  }
  let page = addPage();
  let y = 790;
  function text(value: string, size = 12, color = rgb(.1, .13, .2)) {
    for (const line of wrap(value, font, size, 490)) {
      if (y < 60) { page = addPage(); y = 790; }
      page.drawText(line, { x: 50, y, size, font, color });
      y -= size * 1.6;
    }
  }
  function section(title: string) { y -= 18; text(title, 16, rgb(.03, .23, .77)); y -= 6; }
  text("Berthio / Booking confirmation", 22, rgb(.03, .23, .77));
  text(marina.name, 18);
  y -= 12;
  text("Your berth is booked. Payment verified.");
  text(`Booking reference: ${booking.reference}`);
  section("Vessel & stay");
  text(`Check-in: ${formatBookingDate(booking.arrivalDate)} from ${formatBookingTime(booking.eta)}`);
  text(`Check-out: ${formatBookingDate(booking.departureDate)} until ${formatBookingTime(booking.etd)}`);
  text(`Stay duration: ${bookingNights(booking.arrivalDate, booking.departureDate)} nights`);
  text(`Registered vessel: ${formatVesselName(booking.vesselName)}`);
  text(`Dimensions: ${booking.vesselLengthM}m LOA × ${booking.vesselBeamM}m beam × ${booking.vesselDraftM}m draft`);
  text(`Berth assignment: ${berthAssignmentLabel(payment.berthAssignment)}`);
  section("Payment summary");
  for (const line of confirmationPriceLines(payment.priceSnapshot, payment.amountTotalMinor, payment.currency)) {
    text(`${line.label}: ${confirmationMoney(line.amount, payment.currency)}`);
  }
  text(`Total paid: ${confirmationMoney(payment.amountTotalMinor, payment.currency)}`, 16);
  section("Before you arrive");
  text("Keep this reference for check-in. Contact the marina for arrival instructions and berth guidance.");
  if (marina.contactPhone) text(`Marina phone: ${marina.contactPhone}`);
  if (marina.contactEmail) text(`Marina email: ${marina.contactEmail}`);
  if (marina.websiteUrl) text(`Marina website: ${marina.websiteUrl}`);
  y -= 20;
  text("Booking confirmation. This document is not a tax invoice.", 10);
  return document.save();
}
