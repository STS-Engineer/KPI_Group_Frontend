import { useEffect, useState } from "react";
import apiClient, { getApiErrorMessage } from "../../../api/client";
import SelectMenu from "../../../components/SelectMenu.jsx";
import { ClearFiltersButton } from "../../../components/FilterControls.jsx";
import { ActivityIcon, UserIcon } from "../../../components/icons.jsx";
import { EmptyState, StatusPill } from "../../Responsibles/components/ui.jsx";
import { TONE_DOT, describeEventDetails, formatDateTime, getEventLabel, getEventTone } from "./adminUi";

const EVENT_FILTERS = [
  { value: "", label: "All events" },
  { value: "login.success", label: "Sign-ins" },
  { value: "login.failure", label: "Failed sign-ins" },
  { value: "account.locked", label: "Account lockouts" },
  { value: "password.reset_requested", label: "Reset requests" },
  { value: "password.reset", label: "Password resets" },
  { value: "user.created", label: "Accounts created" },
  { value: "user.updated", label: "Accounts updated" },
  { value: "user.deleted", label: "Accounts deleted" },
  { value: "user.microsoft_linked", label: "Microsoft accounts linked" },
  { value: "settings.updated", label: "Settings changes" },
];

// Security audit trail (kpi_app_auth_event), newest first.
export default function ActivityLog({ users, userFilter, onUserFilterChange, refreshKey }) {
  const [eventType, setEventType] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const accountOptions = [
    { value: "", label: "All accounts" },
    ...users.map((user) => ({ value: String(user.user_id), label: user.full_name || user.email, hint: user.email })),
  ];
  // Each dot has the colour of the matching pill in the table.
  const eventOptions = EVENT_FILTERS.map((filter) => ({
    ...filter,
    dot: filter.value ? TONE_DOT[getEventTone(filter.value)] : undefined,
  }));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get("/api/admin/auth-events", {
        params: { limit: 300, event_type: eventType || undefined, user_id: userFilter || undefined },
      })
      .then((res) => {
        if (cancelled) return;
        setEvents(res.data?.events || []);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, "Unable to load the activity log."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventType, userFilter, refreshKey]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <SelectMenu
          icon={UserIcon}
          label="Account"
          value={String(userFilter || "")}
          options={accountOptions}
          onChange={onUserFilterChange}
          active={Boolean(userFilter)}
          searchable={accountOptions.length > 8}
          searchPlaceholder="Search an account..."
          menuWidth={300}
        />
        <SelectMenu
          icon={ActivityIcon}
          label="Event"
          value={eventType}
          options={eventOptions}
          onChange={setEventType}
          active={Boolean(eventType)}
        />
        {userFilter || eventType ? (
          <ClearFiltersButton
            onClick={() => {
              onUserFilterChange("");
              setEventType("");
            }}
          />
        ) : null}
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">Latest 300 events</span>
      </div>

      {error ? <div className="px-5 py-4 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
      {!error && loading ? (
        <div className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">Loading...</div>
      ) : null}
      {!error && !loading && !events.length ? (
        <div className="p-5">
          <EmptyState>No events match these filters.</EmptyState>
        </div>
      ) : null}

      {!error && !loading && events.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-5 py-2.5">When</th>
                <th className="px-5 py-2.5">Event</th>
                <th className="px-5 py-2.5">Account</th>
                <th className="px-5 py-2.5">By</th>
                <th className="px-5 py-2.5">Details</th>
                <th className="px-5 py-2.5">IP address</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.event_id} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-500 dark:text-slate-400">{formatDateTime(event.created_at, "-")}</td>
                  <td className="px-5 py-2.5">
                    <StatusPill tone={getEventTone(event.event_type)}>{getEventLabel(event.event_type)}</StatusPill>
                  </td>
                  <td className="px-5 py-2.5 text-slate-700 dark:text-slate-200">{event.email || "-"}</td>
                  <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{event.actor_email || "-"}</td>
                  <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{describeEventDetails(event) || "-"}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-slate-400 dark:text-slate-500">
                    {event.ip_address || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
