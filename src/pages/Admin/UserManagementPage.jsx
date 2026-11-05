import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient, { getApiErrorMessage } from "../../api/client";
import BoardTitle from "../../components/BoardTitle.jsx";
import { useAuth } from "../../auth/AuthContext";
import Avatar from "../../components/Avatar.jsx";
import DropdownMenu from "../../components/DropdownMenu.jsx";
import { ConfirmDialog } from "../../components/Dialog.jsx";
import {
  ActivityIcon,
  BanIcon,
  CheckCircleIcon,
  CloseIcon,
  EditIcon,
  KeyIcon,
  LinkIcon,
  LogoutIcon,
  MailIcon,
  MicrosoftLogo,
  MoreIcon,
  ShieldIcon,
  TrashIcon,
  UnlockIcon,
  UserPlusIcon,
} from "../../components/icons.jsx";
import { EmptyState, StatTile, StatusPill } from "../Responsibles/components/ui.jsx";
import ActivityLog from "./components/ActivityLog";
import KpiChangeLog from "./components/KpiChangeLog";
import MicrosoftSignInSettings from "./components/MicrosoftSignInSettings";
import UserFormModal from "./components/UserFormModal";
import { ManualLinkModal, TemporaryPasswordModal } from "./components/UserActionModals";
import { SIGN_IN_METHOD_META, TONE_DOT, USER_STATUS_META, formatDateTime } from "./components/adminUi";
import { PeopleIdBadge } from "./components/formUi";
import { ROLE_META, getRoleMeta } from "../../constants/userRoles";
import SelectMenu from "../../components/SelectMenu.jsx";
import { ClearFiltersButton, SearchField } from "../../components/FilterControls.jsx";

// Filter lists: each dot has the colour of the matching pill in the table.
const ROLE_FILTER_OPTIONS = [
  { value: "", label: "All roles" },
  ...Object.entries(ROLE_META).map(([value, meta]) => ({ value, label: meta.label, dot: TONE_DOT[meta.tone] })),
];
const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  ...Object.entries(USER_STATUS_META).map(([value, meta]) => ({ value, label: meta.label, dot: TONE_DOT[meta.tone] })),
];
// How the accounts sign in, and the ones a first Microsoft sign-in created.
const SIGN_IN_FILTER_OPTIONS = [
  { value: "", label: "All sign-in methods" },
  { value: "microsoft", label: "Microsoft", dot: TONE_DOT[SIGN_IN_METHOD_META.microsoft.tone] },
  { value: "password", label: "Password", dot: TONE_DOT[SIGN_IN_METHOD_META.password.tone] },
  { value: "created_microsoft", label: "Created by Microsoft sign-in", dot: TONE_DOT.navy },
];
const matchesSignInFilter = (user, filter) => {
  if (filter === "microsoft") return user.has_microsoft;
  if (filter === "password") return user.has_password;
  if (filter === "created_microsoft") return user.created_via === "microsoft";
  return true;
};

// The ways an account can sign in today, as badges.
function SignInMethods({ user }) {
  if (!user.has_microsoft && !user.has_password) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">Not yet</span>;
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {user.has_microsoft ? (
        <StatusPill tone={SIGN_IN_METHOD_META.microsoft.tone}>
          <span className="inline-flex items-center gap-1">
            <MicrosoftLogo size={10} /> {SIGN_IN_METHOD_META.microsoft.label}
          </span>
        </StatusPill>
      ) : null}
      {user.has_password ? (
        <StatusPill tone={SIGN_IN_METHOD_META.password.tone}>{SIGN_IN_METHOD_META.password.label}</StatusPill>
      ) : null}
    </span>
  );
}

const primaryButtonClass =
  "inline-flex items-center gap-2 rounded-xl btn-brand px-4 py-2.5 text-sm font-bold shadow-md shadow-blue-500/20 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:shadow-none dark:focus-visible:ring-blue-500/30";

function Notice({ notice, onDismiss }) {
  if (!notice) return null;
  const tones = {
    success: "border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300",
    error: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
  };
  const Icon = notice.tone === "error" ? BanIcon : CheckCircleIcon;
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm animate-kpi-pop ${tones[notice.tone]}`}
    >
      <Icon size={18} className="mt-px shrink-0" />
      <span className="flex-1">{notice.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-lg p-0.5 opacity-60 transition hover:opacity-100"
        aria-label="Dismiss"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

// Per-row actions, grouped: account details, access, then the sensitive ones.
function RowActions({ user, isSelf, onAction }) {
  const statusMeta = USER_STATUS_META[user.status] || { label: user.status, tone: "slate" };
  const item = (key, props) => ({ key, ...props, onSelect: () => onAction(key, user) });

  return (
    <DropdownMenu
      label={`Actions for ${user.email}`}
      width={300}
      renderTrigger={({ ref, open, props }) => (
        <button
          ref={ref}
          type="button"
          {...props}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 dark:focus-visible:ring-blue-500/20 ${
            open
              ? "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          }`}
        >
          <MoreIcon size={18} />
        </button>
      )}
      header={
        <div className="flex items-center gap-3">
          <Avatar name={user.full_name || user.email} seed={user.email} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-slate-900 dark:text-white">
              {user.full_name}
              {isSelf ? <span className="ml-1.5 text-xs font-bold text-blue-600 dark:text-blue-300">(you)</span> : null}
            </div>
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
            <div className="mt-1.5">
              <StatusPill tone={statusMeta.tone}>{statusMeta.label}</StatusPill>
            </div>
          </div>
        </div>
      }
      sections={[
        {
          key: "account",
          title: "Account",
          items: [
            item("edit", { label: "Edit account", description: "Name, role and linked person", icon: EditIcon }),
            item("activity", { label: "View activity", description: "Sign-ins and changes", icon: ActivityIcon }),
          ],
        },
        {
          key: "access",
          title: "Access",
          items: [
            user.is_active
              ? item("password-link", {
                  label: user.has_password
                    ? "Send a reset link"
                    : user.has_microsoft
                      ? "Send a password link"
                      : "Resend the invitation",
                  description: user.has_password
                    ? "E-mail valid 60 minutes"
                    : user.has_microsoft
                      ? "To also sign in with a password · valid 60 minutes"
                      : "E-mail valid 72 hours",
                  icon: MailIcon,
                  tone: "brand",
                })
              : null,
            user.has_microsoft
              ? item("unlink-microsoft", {
                  label: "Unlink the Microsoft account",
                  description: "Linked again at the next Microsoft sign-in",
                  icon: LinkIcon,
                })
              : null,
            !isSelf
              ? item("temporary-password", {
                  label: "Set a temporary password",
                  description: "Changed at the next sign-in",
                  icon: KeyIcon,
                })
              : null,
            user.status === "locked"
              ? item("unlock", {
                  label: "Unlock the account",
                  description: `Locked until ${formatDateTime(user.locked_until)}`,
                  icon: UnlockIcon,
                  tone: "brand",
                })
              : null,
            user.active_sessions > 0
              ? item("revoke-sessions", {
                  label: isSelf ? "Sign out my other devices" : "Sign out of all devices",
                  description: `${user.active_sessions} active session${user.active_sessions > 1 ? "s" : ""}`,
                  icon: LogoutIcon,
                })
              : null,
          ],
        },
        {
          key: "danger",
          title: "Danger zone",
          items: [
            !isSelf
              ? item("toggle-active", {
                  label: user.is_active ? "Disable the account" : "Enable the account",
                  description: user.is_active ? "Signs out, blocks sign-in" : "Allows sign-in again",
                  icon: user.is_active ? BanIcon : CheckCircleIcon,
                  tone: user.is_active ? "warning" : "brand",
                })
              : null,
            !isSelf
              ? item("delete", {
                  label: "Delete the account",
                  description: "Permanent, cannot be undone",
                  icon: TrashIcon,
                  tone: "danger",
                })
              : null,
          ],
        },
      ]}
    />
  );
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("users");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [signInFilter, setSignInFilter] = useState("");
  const [activityUserFilter, setActivityUserFilter] = useState("");
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  const [notice, setNotice] = useState(null);
  const [formUser, setFormUser] = useState(undefined); // undefined: closed, null: create, object: edit
  const [temporaryPasswordUser, setTemporaryPasswordUser] = useState(null);
  const [manualLink, setManualLink] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/admin/users");
      setUsers(res.data?.users || []);
      setLoadError("");
    } catch (err) {
      setLoadError(getApiErrorMessage(err, "Unable to load the accounts."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const afterChange = useCallback(
    async (message, tone = "success") => {
      if (message) setNotice({ tone, text: message });
      setActivityRefreshKey((key) => key + 1);
      await loadUsers();
    },
    [loadUsers]
  );

  const runAction = async (request, successMessage) => {
    try {
      const res = await request();
      await afterChange(typeof successMessage === "function" ? successMessage(res.data) : successMessage);
      return res.data;
    } catch (err) {
      setNotice({ tone: "error", text: getApiErrorMessage(err) });
      return null;
    }
  };

  const handleAction = (action, user) => {
    const base = `/api/admin/users/${user.user_id}`;
    switch (action) {
      case "edit":
        setFormUser(user);
        break;
      case "temporary-password":
        setTemporaryPasswordUser(user);
        break;
      case "activity":
        setActivityUserFilter(String(user.user_id));
        setTab("activity");
        break;
      case "password-link":
        runAction(
          () => apiClient.post(`${base}/password-link`),
          (data) =>
            data.email_sent
              ? `${data.purpose === "invite" ? "Invitation" : "Reset link"} sent to ${user.email}.`
              : null
        ).then((data) => {
          if (data && !data.email_sent && data.manual_link) setManualLink({ email: user.email, link: data.manual_link });
        });
        break;
      case "unlock":
        runAction(() => apiClient.post(`${base}/unlock`), `${user.email} can sign in again.`);
        break;
      case "unlink-microsoft":
        setPendingConfirm({
          tone: "warning",
          icon: LinkIcon,
          title: "Unlink the Microsoft account?",
          description: `${user.full_name} (${user.email}) is no longer tied to the Microsoft account it was linked to.`,
          details:
            "Use it when their Microsoft account was replaced: the next \"Continue with Microsoft\" with this e-mail links the new one. Their sessions and password are not changed.",
          confirmLabel: "Unlink",
          run: () =>
            runAction(() => apiClient.post(`${base}/unlink-microsoft`), `${user.email} is no longer linked to a Microsoft account.`),
        });
        break;
      case "revoke-sessions":
        setPendingConfirm({
          tone: "brand",
          icon: LogoutIcon,
          title: user.user_id === currentUser.user_id ? "Sign out your other devices?" : "Sign out of all devices?",
          description: `${user.full_name} (${user.email}) will have to sign in again on every device.`,
          details:
            user.user_id === currentUser.user_id
              ? "The session you are using now is kept."
              : `${user.active_sessions} active session${user.active_sessions > 1 ? "s" : ""} will end immediately.`,
          confirmLabel: "Sign out",
          run: () =>
            runAction(
              () => apiClient.post(`${base}/revoke-sessions`),
              (data) => `${data.sessions_revoked} session(s) ended for ${user.email}.`
            ),
        });
        break;
      case "toggle-active":
        if (user.is_active) {
          setPendingConfirm({
            tone: "warning",
            icon: BanIcon,
            title: "Disable this account?",
            description: `${user.full_name} (${user.email}) is signed out right away and can no longer sign in.`,
            details: "Nothing is deleted: you can enable the account again at any time.",
            confirmLabel: "Disable account",
            run: () => runAction(() => apiClient.patch(base, { is_active: false }), `${user.email} is disabled.`),
          });
        } else {
          runAction(() => apiClient.patch(base, { is_active: true }), `${user.email} is enabled again.`);
        }
        break;
      case "delete":
        setPendingConfirm({
          tone: "danger",
          icon: TrashIcon,
          title: "Delete this account?",
          description: `${user.full_name} (${user.email}) will be removed permanently.`,
          details:
            "This cannot be undone. To only block access while keeping the account and its history, disable it instead.",
          confirmLabel: "Delete account",
          run: () => runAction(() => apiClient.delete(base), `${user.email} was deleted.`),
        });
        break;
      default:
        break;
    }
  };

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(
      (user) =>
        (!term ||
          user.email.toLowerCase().includes(term) ||
          user.full_name.toLowerCase().includes(term) ||
          String(user.person?.full_name || "").toLowerCase().includes(term)) &&
        (!roleFilter || user.role === roleFilter) &&
        (!statusFilter || user.status === statusFilter) &&
        matchesSignInFilter(user, signInFilter)
    );
  }, [users, search, roleFilter, statusFilter, signInFilter]);

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.status === "active").length,
      admins: users.filter((user) => user.role === "admin" && user.is_active).length,
      invited: users.filter((user) => user.status === "invited").length,
      microsoft: users.filter((user) => user.created_via === "microsoft").length,
      attention: users.filter((user) => user.status === "locked" || user.status === "disabled").length,
    }),
    [users]
  );

  const tabClass = (value) =>
    `rounded-xl px-4 py-2 text-sm font-bold transition ${
      tab === value
        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white dark:shadow-none"
        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    }`;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <BoardTitle
          icon={ShieldIcon}
          eyebrow="Administration"
          title="Users and access"
          subtitle="Create accounts, manage roles and access, and review sign-in activity."
        />
        <button type="button" className={primaryButtonClass} onClick={() => setFormUser(null)}>
          <UserPlusIcon size={18} /> New account
        </button>
      </div>

      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Accounts" value={stats.total} />
        <StatTile label="Active" value={stats.active} tone="green" />
        <StatTile label="Administrators" value={stats.admins} tone="orange" />
        <StatTile label="Invitations pending" value={stats.invited} tone="blue" />
        <StatTile label="Created via Microsoft" value={stats.microsoft} tone={stats.microsoft ? "navy" : "muted"} />
        <StatTile label="Locked or disabled" value={stats.attention} tone={stats.attention ? "red" : "muted"} />
      </div>

      <div className="mb-4 inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/70">
        <button type="button" className={tabClass("users")} onClick={() => setTab("users")}>
          Accounts
        </button>
        <button type="button" className={tabClass("activity")} onClick={() => setTab("activity")}>
          Activity log
        </button>
        <button type="button" className={tabClass("kpi-audit")} onClick={() => setTab("kpi-audit")}>
          KPI audit trail
        </button>
        <button type="button" className={tabClass("microsoft")} onClick={() => setTab("microsoft")}>
          Microsoft sign-in
        </button>
      </div>

      {tab === "microsoft" ? (
        <MicrosoftSignInSettings onSaved={() => setActivityRefreshKey((key) => key + 1)} />
      ) : tab === "kpi-audit" ? (
        <KpiChangeLog />
      ) : tab === "activity" ? (
        <ActivityLog
          users={users}
          userFilter={activityUserFilter}
          onUserFilterChange={setActivityUserFilter}
          refreshKey={activityRefreshKey}
        />
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search by name or e-mail"
              label="Search accounts"
              className="w-full sm:w-72"
            />
            <SelectMenu
              icon={ShieldIcon}
              label="Role"
              value={roleFilter}
              options={ROLE_FILTER_OPTIONS}
              onChange={setRoleFilter}
              active={Boolean(roleFilter)}
            />
            <SelectMenu
              icon={CheckCircleIcon}
              label="Status"
              value={statusFilter}
              options={STATUS_FILTER_OPTIONS}
              onChange={setStatusFilter}
              active={Boolean(statusFilter)}
            />
            <SelectMenu
              icon={KeyIcon}
              label="Sign-in"
              value={signInFilter}
              options={SIGN_IN_FILTER_OPTIONS}
              onChange={setSignInFilter}
              active={Boolean(signInFilter)}
            />
            {search || roleFilter || statusFilter || signInFilter ? (
              <ClearFiltersButton
                onClick={() => {
                  setSearch("");
                  setRoleFilter("");
                  setStatusFilter("");
                  setSignInFilter("");
                }}
              />
            ) : null}
            <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
              {visibleUsers.length} of {users.length} accounts
            </span>
          </div>

          {loadError ? <div className="px-5 py-4 text-sm text-red-600 dark:text-red-400">{loadError}</div> : null}
          {!loadError && loading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">Loading...</div>
          ) : null}
          {!loadError && !loading && !visibleUsers.length ? (
            <div className="p-5">
              <EmptyState>{users.length ? "No account matches these filters." : "No account yet."}</EmptyState>
            </div>
          ) : null}

          {!loadError && !loading && visibleUsers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5">Account</th>
                    <th className="px-5 py-2.5">Role</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Sign-in</th>
                    <th className="px-5 py-2.5">Last sign-in</th>
                    <th className="px-5 py-2.5">Sessions</th>
                    <th className="px-5 py-2.5">Linked person</th>
                    <th className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => {
                    const isSelf = user.user_id === currentUser?.user_id;
                    const statusMeta = USER_STATUS_META[user.status] || { label: user.status, tone: "slate" };
                    return (
                      <tr key={user.user_id} className="border-t border-slate-100 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={user.full_name || user.email} seed={user.email} size="sm" />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800 dark:text-white">
                                {user.full_name}
                                {isSelf ? <span className="ml-2 text-xs font-bold text-blue-600 dark:text-blue-300">(you)</span> : null}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <StatusPill tone={getRoleMeta(user.role).tone}>{getRoleMeta(user.role).label}</StatusPill>
                          {/* The role is set once; this shows when the person's assignments now say otherwise. */}
                          {user.org_role && user.role !== "admin" && user.org_role.role !== user.role ? (
                            <div
                              className="mt-1 whitespace-nowrap text-xs text-slate-400 dark:text-slate-500"
                              title={user.org_role.label ? `Assignment: ${user.org_role.label}` : "No active assignment"}
                            >
                              Assignments: {getRoleMeta(user.org_role.role).label}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-3">
                          <StatusPill tone={statusMeta.tone}>{statusMeta.label}</StatusPill>
                          {user.status === "locked" ? (
                            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">until {formatDateTime(user.locked_until)}</div>
                          ) : null}
                        </td>
                        <td className="px-5 py-3">
                          <SignInMethods user={user} />
                          {user.created_via === "microsoft" ? (
                            <div className="mt-1 whitespace-nowrap text-xs text-slate-400 dark:text-slate-500">Created by Microsoft sign-in</div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-slate-500 dark:text-slate-400">
                          {formatDateTime(user.last_login_at)}
                          {user.last_login_at && user.last_login_method ? (
                            <div className="text-xs text-slate-400 dark:text-slate-500">
                              with {user.last_login_method === "microsoft" ? "Microsoft" : "password"}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-3 tabular-nums text-slate-500 dark:text-slate-400">{user.active_sessions}</td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                          {user.person ? (
                            <span className="flex items-center gap-2">
                              <span>{user.person.full_name}</span>
                              <PeopleIdBadge peopleId={user.person.people_id} />
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <RowActions user={user} isSelf={isSelf} onAction={handleAction} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      )}

      {formUser !== undefined ? (
        <UserFormModal
          user={formUser}
          currentUserId={currentUser?.user_id}
          onClose={() => setFormUser(undefined)}
          onSaved={async ({ user, message, manualLink: link }) => {
            setFormUser(undefined);
            await afterChange(message);
            if (link) setManualLink({ email: user.email, link });
          }}
        />
      ) : null}

      {temporaryPasswordUser ? (
        <TemporaryPasswordModal
          user={temporaryPasswordUser}
          onClose={() => setTemporaryPasswordUser(null)}
          onSaved={async ({ message }) => {
            setTemporaryPasswordUser(null);
            await afterChange(message);
          }}
        />
      ) : null}

      {manualLink ? (
        <ManualLinkModal email={manualLink.email} link={manualLink.link} onClose={() => setManualLink(null)} />
      ) : null}

      {pendingConfirm ? (
        <ConfirmDialog
          tone={pendingConfirm.tone}
          icon={pendingConfirm.icon}
          title={pendingConfirm.title}
          description={pendingConfirm.description}
          details={pendingConfirm.details}
          confirmLabel={pendingConfirm.confirmLabel}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={async () => {
            await pendingConfirm.run();
            setPendingConfirm(null);
          }}
        />
      ) : null}
    </main>
  );
}
