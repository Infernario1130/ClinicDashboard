import AppointmentsDashboard from "@/components/appointments-dashboard";
import { getAppointments } from "@/lib/mock-appointments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const appointments = await getAppointments();
  return <AppointmentsDashboard initialAppointments={appointments} />;
}