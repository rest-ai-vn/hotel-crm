import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Rooms } from "./pages/Rooms";
import { Reservations } from "./pages/Reservations";
import { Guests } from "./pages/Guests";
import { Dashboard } from "./pages/Dashboard";
import { Housekeeping } from "./pages/Housekeeping";
import { RatePlans } from "./pages/RatePlans";
import { Calendar } from "./pages/Calendar";
import { Services } from "./pages/Services";
import { Cashbook } from "./pages/Cashbook";
import { Reports } from "./pages/Reports";
import { Shifts } from "./pages/Shifts";
import { NightAudit } from "./pages/NightAudit";
import { AuditLogs } from "./pages/AuditLogs";
import { Properties } from "./pages/Properties";
import { BookingPublic } from "./pages/BookingPublic";
import { AiIntegration } from "./pages/AiIntegration";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/book" element={<BookingPublic />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/reservations" element={<Reservations />} />
        <Route path="/guests" element={<Guests />} />
        <Route path="/housekeeping" element={<Housekeeping />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/rate-plans" element={<RatePlans />} />
        <Route path="/services" element={<Services />} />
        <Route path="/cashbook" element={<Cashbook />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/shifts" element={<Shifts />} />
        <Route path="/night-audit" element={<NightAudit />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
        <Route path="/properties" element={<Properties />} />
        <Route path="/ai-integration" element={<AiIntegration />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
