import AppointmentsDashboard from "@/components/appointments-dashboard";
import { getAppointments } from "@/lib/mock-appointments";

export default async function Home() {
  const appointments = await getAppointments();
  return <AppointmentsDashboard initialAppointments={appointments} />;
}