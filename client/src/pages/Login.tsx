import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { IconMark } from "../components/Icons";

export function Login() {
  const { signIn } = useStore();
  const [email, setEmail] = useState("maya@lucent.app");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Sign in · Lucent";
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in");
      passwordRef.current?.focus();
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="wall" />
      <div className="auth-card glass">
        <div className="auth-brand">
          <span className="brand-mark">
            <IconMark size={18} />
          </span>
          <span className="brand-name">Lucent</span>
        </div>
        <h1>Welcome back</h1>
        <p className="auth-sub">Sign in to pick up where your team left off.</p>

        <form className="auth-form" onSubmit={submit}>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              ref={passwordRef}
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-alt">
          New here? <Link to="/register">Create an account</Link>
        </p>
        <p className="auth-hint">Demo workspace · maya@lucent.app · demo1234</p>
      </div>
    </div>
  );
}
