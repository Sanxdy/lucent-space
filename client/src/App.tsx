import { Navigate, Route, Routes } from "react-router-dom";
import { useStore } from "./store";
import { Shell } from "./components/Shell";
import { Toasts } from "./components/Toasts";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Home } from "./pages/Home";
import { Tasks } from "./pages/Tasks";
import { Calendar } from "./pages/Calendar";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Insights } from "./pages/Insights";
import { Team } from "./pages/Team";
import { Settings } from "./pages/Settings";

function Splash() {
  return (
    <div className="auth">
      <div className="wall" />
      <div className="auth-card glass" style={{ display: "grid", placeItems: "center", gap: 14, width: 220, padding: 34 }}>
        <span className="spinner" role="status" aria-label="Opening your workspace" />
        <span className="sub">Opening your workspace…</span>
      </div>
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="auth">
      <div className="wall" />
      <div className="auth-card glass" role="alert">
        <h1>Could not open the workspace</h1>
        <p className="auth-sub">{message}</p>
        <button className="btn btn-primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

export function App() {
  const { me, data, loading, error, retry } = useStore();

  if (loading) return <Splash />;
  if (error && !data) return <LoadError message={error} onRetry={() => void retry()} />;

  return (
    <>
      <Routes>
        <Route path="/login" element={me ? <Navigate to="/home" replace /> : <Login />} />
        <Route path="/register" element={me ? <Navigate to="/home" replace /> : <Register />} />
        <Route
          element={me ? <Shell /> : <Navigate to="/login" replace />}
          path="/"
        >
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="insights" element={<Insights />} />
          <Route path="team" element={<Team />} />
          <Route path="settings" element={<Navigate to="/settings/profile" replace />} />
          <Route path="settings/:section" element={<Settings />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
      <Toasts />
    </>
  );
}
