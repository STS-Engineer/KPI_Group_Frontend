import { useEffect, useState } from "react";
import apiClient, { getApiErrorMessage } from "../../../api/client";
import { Spinner } from "../../../components/Dialog.jsx";
import { AlertIcon, CheckCircleIcon, MicrosoftLogo } from "../../../components/icons.jsx";
import { getRoleMeta } from "../../../constants/userRoles";
import { FormSection, ToggleRow } from "./formUi";
import { formatDateTime } from "./adminUi";

// Where each role comes from in the role assignments of public.people.
const ROLE_SOURCES = {
  ceo: "Assignment \"CEO\"",
  vp: "Any assignment at level VP",
  zone_manager: "Assignment \"Zone managers\"",
  plant_manager: "Assignment \"Plant manager\"",
  user: "Any other assignment (KAM, directors, functional managers...) or none",
};

// "Continue with Microsoft": which roles get an account at their first sign-in.
export default function MicrosoftSignInSettings({ onSaved }) {
  const [settings, setSettings] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/api/admin/settings/microsoft-sign-in")
      .then((res) => {
        if (cancelled) return;
        setSettings(res.data.settings);
        setRoles(res.data.settings.auto_create_roles);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getApiErrorMessage(err, "Unable to load the Microsoft sign-in settings."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) return <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{loadError}</p>;
  if (!settings) {
    return (
      <div className="flex items-center gap-2 px-1 py-10 text-sm text-slate-400 dark:text-slate-500">
        <Spinner /> Loading...
      </div>
    );
  }

  const changed = [...roles].sort().join(",") !== [...settings.auto_create_roles].sort().join(",");

  const toggle = (role, checked) => {
    setNotice(null);
    setRoles((current) => (checked ? [...current, role] : current.filter((item) => item !== role)));
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiClient.put("/api/admin/settings/microsoft-sign-in", { auto_create_roles: roles });
      setSettings(res.data.settings);
      setRoles(res.data.settings.auto_create_roles);
      setNotice({ tone: "success", text: "Saved. It applies from the next Microsoft sign-in." });
      onSaved?.();
    } catch (err) {
      setNotice({ tone: "error", text: getApiErrorMessage(err, "The settings could not be saved.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <MicrosoftLogo size={20} />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Sign in with Microsoft</h2>
            <p className="mt-0.5 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Everyone who already has an account can use "Continue with Microsoft", whatever their role. Someone without an
              account gets one at their first Microsoft sign-in only if the role of their assignments is switched on below —
              linked to their person, with that role and no password. Administrator is never given automatically.
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
            settings.enabled
              ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          }`}
        >
          {settings.enabled ? <CheckCircleIcon size={14} /> : <AlertIcon size={14} />}
          {settings.enabled ? "Button shown on the sign-in page" : "Not configured on the server"}
        </span>
      </div>

      {!settings.enabled ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          The AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and AZURE_REDIRECT_URI settings of the backend are not
          all set, so the button is hidden. The roles below can still be prepared.
        </p>
      ) : null}

      <div className="mt-6">
        <FormSection title="Account created at the first Microsoft sign-in" hint={`${roles.length} of ${settings.role_choices.length} roles`}>
          <div className="grid gap-2.5 md:grid-cols-2">
            {settings.role_choices.map((role) => (
              <ToggleRow
                key={role}
                checked={roles.includes(role)}
                onChange={(checked) => toggle(role, checked)}
                disabled={saving}
                title={getRoleMeta(role).label}
                description={ROLE_SOURCES[role]}
              />
            ))}
          </div>
        </FormSection>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
        <button
          type="button"
          onClick={save}
          disabled={!changed || saving}
          className="inline-flex items-center gap-2 rounded-xl btn-brand px-4 py-2.5 text-sm font-bold shadow-md shadow-blue-500/20 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-none dark:focus-visible:ring-blue-500/30"
        >
          {saving ? <Spinner /> : null}
          Save
        </button>
        {changed ? (
          <button
            type="button"
            onClick={() => setRoles(settings.auto_create_roles)}
            disabled={saving}
            className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            Cancel changes
          </button>
        ) : null}
        {notice ? (
          <span
            role={notice.tone === "error" ? "alert" : "status"}
            className={`text-sm font-semibold ${notice.tone === "error" ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-300"}`}
          >
            {notice.text}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
          {settings.updated_at
            ? `Last changed ${formatDateTime(settings.updated_at)}${settings.updated_by ? ` by ${settings.updated_by.full_name || settings.updated_by.email}` : ""}`
            : "Default settings"}
        </span>
      </div>
    </section>
  );
}
