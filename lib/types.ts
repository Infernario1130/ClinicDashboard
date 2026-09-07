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
