// Shape mirrors the Supabase `appointments` table exactly (snake_case, same
// column types) so swapping the mock data source for a real Supabase query
// later requires no changes to any component.
export type PatientType = "visited_recently" | "not_recent";
export type AppointmentStatus = "Needs entry" | "Done";
export type ChangeState =
  | "none"
  | "Rescheduled"
  | "Cancelled"
  | "Confirmed"
  | "No answer";
export type ReminderStage = "morning" | "imminent" | null;
export interface Appointment {
  id: string;
  patient_name: string;
  patient_type: PatientType;
  reason: string;
  appointment_date: string; // date, 'YYYY-MM-DD'
  assigned_time: string; // 'HH:MM' (24h)
  phone_number: string;
  fee: number;
  status: AppointmentStatus;
  payment_status: string; // "Pending" | "Confirmed"
}
export interface CallbackLead {
  id: string;
  name: string;
  phone_number: string;
  enquired_about: string;
  called_at: string;
  notes: string;
  called_back: boolean;
}
