// src/pages/admin/AdminRouter.jsx
import { Routes, Route } from "react-router-dom";
import AdminLogin from "./AdminLogin.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import AdminTitleEdit from "./AdminTitleEdit.jsx";
import AdminSeriesEdit from "./AdminSeriesEdit.jsx"; // ✅ ADD
import AdminGospelNew from "./AdminGospelNew.jsx";
import AdminGate from "../../components/admin/AdminGate.jsx";
import PageTitle from "../../components/PageTitle.jsx";

export default function AdminRouter() {
  return (
    <Routes>
      <Route path="/" element={<AdminLogin />} />
      <Route
        path="/dashboard"
        element={
          <AdminGate>
            <AdminDashboard />
          </AdminGate>
        }
      />

      <Route
        path="/gospel/new"
        element={
          <AdminGate>
            <AdminGospelNew />
          </AdminGate>
        }
      />

      <Route
        path="/titles/:id"
        element={
          <AdminGate>
            <AdminTitleEdit />
          </AdminGate>
        }
      />

      {/* ✅ SÉRIE GLOBAL (sr-xxxx) */}
      <Route
        path="/series/:id"
        element={
          <AdminGate>
            <AdminSeriesEdit />
          </AdminGate>
        }
      />
    </Routes>
  );
}
