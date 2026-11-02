import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import MainLayout from "./layouts/MainLayout.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { ThemeProvider } from "./theme/ThemeContext.jsx";
import { RequireAdmin, RequireAuth, RequireOwnDashboard } from "./auth/RouteGuards.jsx";
import LoginPage from "./pages/Auth/LoginPage.jsx";
import ForgotPasswordPage from "./pages/Auth/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/Auth/ResetPasswordPage.jsx";
import ChangePasswordPage from "./pages/Auth/ChangePasswordPage.jsx";
import UserManagementPage from "./pages/Admin/UserManagementPage.jsx";
import KpiAdminPage from "./pages/KPIs/KpiAdminPage.jsx";
import KpiTrendsPage from "./pages/KPIs/KpiTrendsPage.jsx";
import KpiIntakePage from "./pages/KpiIntake/KpiIntakePage.jsx";
import CeoReportPlantPage from "./pages/CeoReport/CeoReportPlantPage.jsx";
import TargetAdjustmentReviewPage from "./pages/TargetAdjustments/TargetAdjustmentReviewPage.jsx";
import DashboardPage from "./pages/Dashboard/DashboardPage.jsx";
import DashboardHistoryPage from "./pages/Dashboard/DashboardHistoryPage.jsx";
import TrainingCenterPage from "./pages/Training/TrainingCenterPage.jsx";
import TrainingDocumentationPage from "./pages/Training/TrainingDocumentationPage.jsx";
import TrainingDashboardPage from "./pages/Training/TrainingDashboardPage.jsx";
import CorrectiveActionsListPage from "./pages/CorrectiveActions/CorrectiveActionsListPage.jsx";
import CorrectiveActionFormPage from "./pages/CorrectiveActions/CorrectiveActionFormPage.jsx";
import CorrectiveActionsBulkPage from "./pages/CorrectiveActions/CorrectiveActionsBulkPage.jsx";
import KpiEntryFormPage from "./pages/Responsibles/KpiEntryFormPage.jsx";
import ResponsibleDashboardPage from "./pages/Responsibles/ResponsibleDashboardPage.jsx";
import AssistantWidget from "./components/assistant/AssistantWidget.jsx";

// GET /responsible/:responsibleId/kpis/:kpiId/edit (index.js:24322) only ever
// redirected to the dashboard with ?editKpi=<kpiId> to auto-open the edit
// modal -- ResponsibleDashboardPage already handles that query param itself.
function ResponsibleKpiEditRedirect() {
  const { responsibleId, kpiId } = useParams();
  return <Navigate to={`/responsible/${responsibleId}/dashboard?editKpi=${kpiId}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            {/* Sign-in pages */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Open pages, as before -- including every page reached from an e-mail link. */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/form" element={<KpiEntryFormPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dashboard-history" element={<DashboardHistoryPage />} />
              <Route path="/kpi-training-center" element={<TrainingCenterPage />} />
              <Route path="/kpi-training-documentation" element={<TrainingDocumentationPage />} />
              <Route path="/kpi-training-dashboard" element={<TrainingDashboardPage />} />
              <Route path="/kpi-target-adjustments/review" element={<TargetAdjustmentReviewPage />} />
              <Route path="/kpi-admin" element={<KpiAdminPage />} />
              <Route path="/kpi-trends" element={<KpiTrendsPage />} />
              {/* KPI & Target Intake: anyone with the link enters lines; only an admin submits them. */}
              <Route path="/kpi-intake" element={<KpiIntakePage />} />
              <Route path="/ceo-report/plants/:plantId" element={<CeoReportPlantPage />} />
              <Route path="/corrective-actions-list" element={<CorrectiveActionsListPage />} />
              <Route path="/corrective-action-form" element={<CorrectiveActionFormPage />} />
              <Route path="/corrective-actions-bulk" element={<CorrectiveActionsBulkPage />} />
            </Route>

            {/* Sign-in required: the Responsible KPI Dashboard and the user administration. */}
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/change-password" element={<ChangePasswordPage />} />
                {/* Each user: their own dashboard only (id = their people_id) */}
                <Route element={<RequireOwnDashboard />}>
                  <Route path="/responsible/:responsibleId/dashboard" element={<ResponsibleDashboardPage />} />
                  <Route path="/responsible/:responsibleId/kpis/:kpiId/edit" element={<ResponsibleKpiEditRedirect />} />
                </Route>

                {/* Administrators only */}
                <Route element={<RequireAdmin />}>
                  <Route path="/admin/users" element={<UserManagementPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
          {/* The AI Assistant button, on every page. */}
          <AssistantWidget />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
