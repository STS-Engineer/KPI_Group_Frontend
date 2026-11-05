import apiClient from "../api/client";

// "Continue with Microsoft": the sign-in runs in a popup on Microsoft's
// "Pick an account" page; the backend's callback page posts the result back
// here (only to this page's origin) and closes the popup. The session cookie
// is then already set, like after a password sign-in.

const MESSAGE_TYPE = "kpi-microsoft-sign-in";
const POPUP_NAME = "kpi-microsoft-sign-in";
const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 680;

// next: the page to open once signed in (also used when the popup is blocked
// and the whole page goes to Microsoft: it comes back to /login?next=...).
export function getMicrosoftSignInUrl(next) {
  const query = new URLSearchParams({ origin: window.location.origin });
  if (next) query.set("next", next);
  return `${apiClient.defaults.baseURL}/api/auth/microsoft/login?${query}`;
}

// Resolves with { ok, error, detail } -- error "closed" when the popup was
// closed before the end. Returns null when the browser blocked the popup.
export function openMicrosoftSignInPopup(next) {
  const left = window.screenX + Math.max(0, (window.outerWidth - POPUP_WIDTH) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - POPUP_HEIGHT) / 2);
  const popup = window.open(
    getMicrosoftSignInUrl(next),
    POPUP_NAME,
    `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${Math.round(left)},top=${Math.round(top)}`
  );
  if (!popup) return null;
  popup.focus?.();

  const apiOrigin = new URL(apiClient.defaults.baseURL, window.location.href).origin;
  return new Promise((resolve) => {
    let settled = false;
    let watcher = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(watcher);
      resolve(result);
    };
    function onMessage(event) {
      if (event.origin !== apiOrigin || event.source !== popup || event.data?.type !== MESSAGE_TYPE) return;
      finish({ ok: Boolean(event.data.ok), error: event.data.error || null, detail: event.data.detail || null });
    }
    window.addEventListener("message", onMessage);
    // Closed by the user: a short delay lets a result posted just before arrive.
    watcher = window.setInterval(() => {
      if (popup.closed) window.setTimeout(() => finish({ ok: false, error: "closed", detail: null }), 400);
    }, 500);
  });
}

// What the sign-in page says for each reason the backend gives.
export function getMicrosoftErrorMessage(error, detail = null) {
  switch (error) {
    case "closed":
      return "The Microsoft sign-in was not completed. You can start it again when you're ready.";
    case "cancelled":
      return "The Microsoft sign-in was cancelled.";
    case "expired":
      return "The Microsoft sign-in took too long or was started in another window. Please try again.";
    case "no_account":
      return "No KPI Manager account matches your Microsoft account. Ask your KPI Manager administrator for access.";
    case "role_not_allowed":
      return `Your role${detail ? ` (${detail})` : ""} cannot open a KPI Manager account with Microsoft. Ask your KPI Manager administrator for an account.`;
    case "person_inactive":
      return "You are no longer listed as an active employee. Contact your KPI Manager administrator.";
    case "disabled":
      return "This account is disabled. Contact your KPI Manager administrator.";
    case "linked_to_other_microsoft_account":
      return "This KPI Manager account is linked to another Microsoft account. Ask your administrator to unlink it.";
    case "too_many_attempts":
      return "Too many sign-in attempts. Try again in a few minutes.";
    case "not_configured":
      return "Sign-in with Microsoft is not available yet. Use your e-mail and password.";
    case "microsoft_error":
      return `Microsoft refused the sign-in${detail ? ` (${detail})` : ""}. Try again or contact your administrator.`;
    case "microsoft_incomplete":
      return "Microsoft did not return your account details. Please try again.";
    default:
      return `The Microsoft sign-in failed${detail ? ` (${detail})` : ""}. Please try again.`;
  }
}

// A reason read from the address bar (popup blocked: whole-page sign-in) can
// be typed by anyone: only a Microsoft error code is shown from there.
export function getMicrosoftErrorFromUrl(searchParams) {
  const error = searchParams.get("microsoft_error");
  if (!error) return "";
  const detail = searchParams.get("microsoft_detail");
  return getMicrosoftErrorMessage(error, /^AADSTS\d{3,9}$/.test(detail || "") ? detail : null);
}
