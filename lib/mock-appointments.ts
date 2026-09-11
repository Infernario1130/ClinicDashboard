import { supabase } from "./supabase";
import type { Appointment, AppointmentStatus } from "./types";

export const HOSPITAL_NAME = "Sangam Super Speciality Eye Hospital";
export const HOSPITAL_LOCATION = "Taramandal, Gorakhpur, Uttar Pradesh";

// Anchor date — now the real current date instead of a fixed demo value.
export const TODAY = new Date().toISOString().slice(0, 10);

// Swap point for Supabase — this now queries the real `appointments` table.
// `status` isn't a Supabase column (it's dashboard-only Docbox-entry tracking),
// so every row loads as "Needs entry" on a fresh page load.
export async function getAppointments(): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error("Failed to fetch appointments:", error.message);
    return [];
  }

  // De-dupe: the n8n booking flow occasionally inserts the same appointment
  // twice in quick succession (identical patient, phone, date, and time —
  // e.g. rows 299/300 for "Aman"). Rather than showing both as separate
  // cards, keep only the earliest (lowest id) row per unique
  // patient+phone+date+time combo. This runs on every poll too, so a
  // duplicate insert never surfaces as a second card even briefly.
  const rows = data ?? [];
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.patient_name ?? ""}|${row.phone_number ?? ""}|${row.appointment_date ?? ""}|${row.assigned_time ?? ""}`;
    const existing = byKey.get(key);
    if (!existing || Number(row.id) < Number(existing.id)) {
      byKey.set(key, row);
    }
  }
  const deduped = Array.from(byKey.values()).sort((a, b) => Number(b.id) - Number(a.id));

  return deduped.map((row): Appointment => ({
    id: String(row.id),
    patient_name: row.patient_name ?? "",
    patient_type: row.patient_type === "visited_recently" ? "visited_recently" : "not_recent",
    reason: row.reason ?? "",
    appointment_date: row.appointment_date ?? "",
    assigned_time: row.assigned_time ?? "",
    phone_number: row.phone_number ?? "",
    fee: row.fee ?? 0,
    status: row.docbox_status === "Done" ? "Done" : "Needs entry",
    payment_status: row["Payment Status"] ?? "",
  }));
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  const { error } = await supabase.from("appointments").update({ docbox_status: status }).eq("id", id);
  if (error) console.error("Failed to update status:", error.message);
}
