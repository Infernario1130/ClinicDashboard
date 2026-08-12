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

  return (data ?? []).map((row): Appointment => ({
    id: String(row.id),
    patient_name: row.patient_name ?? "",
    patient_type: row.patient_type === "visited_recently" ? "visited_recently" : "not_recent",
    reason: row.reason ?? "",
    appointment_date: row.appointment_date ?? "",
    assigned_time: row.assigned_time ?? "",
    phone_number: row.phone_number ?? "",
    fee: row.fee ?? 0,
    status: row.docbox_status === "Done" ? "Done" : "Needs entry",
  }));
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  const { error } = await supabase.from("appointments").update({ docbox_status: status }).eq("id", id);
  if (error) console.error("Failed to update status:", error.message);
}