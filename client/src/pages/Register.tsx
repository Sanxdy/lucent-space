import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { IconMark } from "../components/Icons";

export function Register() {
  const { signUp } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Create account · Lucent";
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await signUp(name.trim(), email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the account");
      emailRef.current?.focus();
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
        <h1>Create your account</h1>
        <p className="auth-sub">You’ll join the Lucent studio workspace and can invite the rest of your team.</p>

        <form className="auth-form" onSubmit={submit}>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              className="input"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="Ada Lovelace"
            />
          </div>
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              ref={emailRef}
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="you@studio.com"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              ref={passwordRef}
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-alt">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
