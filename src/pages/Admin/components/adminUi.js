export const USER_STATUS_META = {
  active: { label: "Active", tone: "green" },
  invited: { label: "Invitation pending", tone: "amber" },
  password_change_required: { label: "Must change password", tone: "blue" },
  locked: { label: "Locked", tone: "red" },
  disabled: { label: "Disabled", tone: "slate" },
};

export const USER_STATUS_OPTIONS = Object.entries(USER_STATUS_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

export { ROLE_OPTIONS } from "../../../constants/userRoles";

// Dot colour of each StatusPill tone, for the filter lists.
export const TONE_DOT = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
  slate: "bg-slate-400",
  orange: "bg-orange-500",
  navy: "bg-blue-900",
  sky: "bg-blue-300 dark:bg-blue-500/30",
  brand: "bg-blue-600",
};

const EVENT_LABELS = {
  "login.success": "Signed in",
  "login.failure": "Failed sign-in",
  "login.blocked": "Sign-in blocked (account locked)",
  "account.locked": "Account locked after failed attempts",
  logout: "Signed out",
  "password.changed": "Changed their password",
  "password.change_failed": "Failed password change",
  "password.reset_requested": "Requested a password reset",
  "password.reset": "Reset their password",
  "invite.accepted": "Activated their account",
  "user.created": "Account created",
  "user.updated": "Account updated",
  "user.deleted": "Account deleted",
  "user.password_link_sent": "Password link sent",
  "user.temporary_password_set": "Temporary password set",
  "user.unlocked": "Account unlocked",
  "user.sessions_revoked": "Signed out of all devices",
  "user.microsoft_linked": "Microsoft account linked",
  "user.microsoft_unlinked": "Microsoft account unlinked",
  "password.temporary_removed": "Temporary password removed (Microsoft sign-in)",
  "settings.updated": "Settings changed",
  "admin.bootstrap": "Administrator created (setup script)",
};

const FAILURE_REASONS = {
  unknown_email: "unknown e-mail",
  wrong_password: "wrong password",
  no_password_set: "password not set yet",
  disabled: "account disabled",
  locked: "account locked",
  rate_limited: "too many requests",
  email_error: "e-mail could not be sent",
  wrong_current_password: "wrong current password",
  no_account: "no account and no matching person",
  role_not_allowed: "role not allowed to create an account",
  person_inactive: "person no longer active",
  linked_to_other_microsoft_account: "linked to another Microsoft account",
  microsoft_incomplete: "Microsoft returned no account details",
};

const MODE_LABELS = {
  invitation: "invitation e-mail",
  temporary_password: "temporary password",
  microsoft: "first Microsoft sign-in",
};

// How someone signs in: badges of the Accounts table.
export const SIGN_IN_METHOD_META = {
  password: { label: "Password", tone: "slate" },
  microsoft: { label: "Microsoft", tone: "blue" },
};

export const getEventLabel = (eventType) => EVENT_LABELS[eventType] || eventType;

export const getEventTone = (eventType) => {
  if (["login.failure", "login.blocked", "account.locked", "password.change_failed"].includes(eventType)) return "red";
  if (eventType === "user.deleted") return "red";
  if (eventType.startsWith("user.") || eventType === "admin.bootstrap" || eventType === "settings.updated") return "orange";
  if (eventType === "login.success") return "green";
  return "slate";
};

// One readable line out of the event's JSON details.
export const describeEventDetails = (event) => {
  const details = event.details || {};
  const parts = [];
  if (details.method === "microsoft") parts.push("with Microsoft");
  if (details.account_created) parts.push("account created");
  if (details.reason) parts.push(FAILURE_REASONS[details.reason] || details.reason);
  if (details.mode) parts.push(MODE_LABELS[details.mode] || details.mode);
  if (details.org_role_label) parts.push(`assignment: ${details.org_role_label}`);
  if (details.auto_create_roles?.to) {
    parts.push(`Microsoft account creation: ${details.auto_create_roles.to.join(", ") || "no role"}`);
  }
  if (details.purpose) parts.push(details.purpose === "invite" ? "invitation" : "reset link");
  if (details.email_sent === false && !details.reason) parts.push("e-mail not sent");
  if (details.sent === true) parts.push("e-mail sent");
  if (details.role && typeof details.role === "string") parts.push(`role: ${details.role}`);
  if (details.role?.to) parts.push(`role: ${details.role.from} → ${details.role.to}`);
  if (details.is_active) parts.push(details.is_active.to ? "enabled" : "disabled");
  if (details.full_name) parts.push(`name: ${details.full_name.to}`);
  if (details.people_id) parts.push("person link changed");
  if (Number(details.sessions_revoked) > 0) parts.push(`${details.sessions_revoked} session(s) ended`);
  return parts.join(" · ");
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const formatDateTime = (value, fallback = "Never") => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateTimeFormatter.format(date);
};
