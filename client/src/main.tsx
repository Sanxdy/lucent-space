import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { StoreProvider } from "./store";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/glass.css";
import "./styles/components.css";
import "./styles/pages.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="auth">
        <div className="wall" />
        <div className="auth-card glass" role="alert">
          <h1>Something broke</h1>
          <p className="auth-sub">{this.state.error.message || "The interface hit an unexpected error."}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <StoreProvider>
          <App />
        </StoreProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
