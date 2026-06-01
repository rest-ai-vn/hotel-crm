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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
