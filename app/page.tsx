import AppointmentsDashboard from "@/components/appointments-dashboard";
import LoginForm from "@/components/login-form";
import { isLoggedIn } from "@/lib/auth";
import { getAppointments } from "@/lib/mock-appointments";
import { getCalls } from "@/lib/calls";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// No data leaves the server until the session cookie checks out (D-360).
export default async function Home() {
  if (!(await isLoggedIn())) return <LoginForm />;
  const [appointments, calls] = await Promise.all([getAppointments(), getCalls()]);
  return <AppointmentsDashboard initialAppointments={appointments} initialCalls={calls} />;
}
