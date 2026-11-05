import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import apiClient, { getApiErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import {
  getMicrosoftErrorFromUrl,
  getMicrosoftErrorMessage,
  getMicrosoftSignInUrl,
  openMicrosoftSignInPopup,
} from "../../auth/microsoftSignIn";
import { getHomePath, getSafeNextPath } from "../../auth/RouteGuards";
import { Spinner } from "../../components/Dialog.jsx";
import { LoginIcon, MicrosoftLogo } from "../../components/icons.jsx";
import { AuthCard, FormAlert, PasswordField, SubmitButton, TextField, secondaryButtonClass } from "./components/authUi";

export default function LoginPage() {
  const { user, status, sessionExpired, login, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get("next"));

  const [email, setEmail] = useState(location.state?.email || "");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(null); // null | "password" | "microsoft"
  // Back from a whole-page Microsoft sign-in that failed: its reason.
  const [error, setError] = useState(() => getMicrosoftErrorFromUrl(searchParams));
  const [microsoftAvailable, setMicrosoftAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/api/auth/providers")
      .then((res) => {
        if (!cancelled) setMicrosoftAvailable(Boolean(res.data?.microsoft));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // The reason is shown once: not again after a reload.
  useEffect(() => {
    if (!searchParams.has("microsoft_error")) return;
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete("microsoft_error");
        next.delete("microsoft_detail");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  const destinationFor = (signedInUser) =>
    signedInUser.must_change_password ? "/change-password" : nextPath || getHomePath(signedInUser);

  if (status === "ready" && user && !pending) {
    return <Navigate to={destinationFor(user)} replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setPending("password");
    setError("");
    try {
      const signedIn = await login(email, password);
      navigate(destinationFor(signedIn), { replace: true });
    } catch (err) {
      setPassword("");
      setError(getApiErrorMessage(err, "Unable to sign in."));
      setPending(null);
    }
  };

  const continueWithMicrosoft = async () => {
    setError("");
    setPending("microsoft");
    const result = openMicrosoftSignInPopup(nextPath);
    // Popup blocked: the whole page goes to Microsoft and comes back here.
    if (!result) {
      window.location.assign(getMicrosoftSignInUrl(nextPath));
      return;
    }
    const outcome = await result;
    if (outcome.ok) {
      const signedIn = await refresh();
      if (signedIn) {
        navigate(destinationFor(signedIn), { replace: true });
        return;
      }
      setError("You are signed in with Microsoft, but the session could not be read. Please try again.");
    } else {
      setError(getMicrosoftErrorMessage(outcome.error, outcome.detail));
    }
    setPending(null);
  };

  return (
    <AuthCard icon={LoginIcon} title="Sign in" subtitle="Welcome back. Use your KPI Manager account to open your dashboard.">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {sessionExpired ? <FormAlert tone="info">Your session has expired. Please sign in again.</FormAlert> : null}
        {location.state?.notice ? <FormAlert tone="success">{location.state.notice}</FormAlert> : null}
        <FormAlert>{error}</FormAlert>

        <TextField
          label="E-mail"
          id="login-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          autoFocus={!email}
          placeholder="firstname.lastname@avocarbon.com"
          required
        />
        <PasswordField
          label="Password"
          id="login-password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          autoFocus={Boolean(email)}
          action={
            <Link
              to="/forgot-password"
              state={{ email }}
              className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
            >
              Forgot your password?
            </Link>
          }
        />

        <div className="pt-1">
          <SubmitButton
            loading={pending === "password"}
            loadingLabel="Signing in..."
            disabled={!email.trim() || !password || pending === "microsoft"}
          >
            Sign in
          </SubmitButton>
        </div>

        {microsoftAvailable ? (
          <>
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              or
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={continueWithMicrosoft}
              disabled={Boolean(pending)}
              aria-busy={pending === "microsoft"}
            >
              {pending === "microsoft" ? <Spinner /> : <MicrosoftLogo size={18} />}
              {pending === "microsoft" ? "Waiting for Microsoft..." : "Continue with Microsoft"}
            </button>
          </>
        ) : null}
      </form>
    </AuthCard>
  );
}
