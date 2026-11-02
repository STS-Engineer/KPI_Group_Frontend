import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import apiClient from "../../api/client";
import BoardTitle from "../../components/BoardTitle.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { CloseIcon, DashboardIcon, MenuIcon } from "../../components/icons.jsx";
import { useTheme } from "../../theme/ThemeContext.jsx";
import { ConfirmDialog } from "./components/ui.jsx";
import KpiMatrix from "./components/KpiMatrix.jsx";
import KpiDetailsModal from "./components/KpiDetailsModal.jsx";
import KpiEditorModal, {
  KPI_CREATE_DEFAULTS,
  buildKpiPayload,
  kpiRowToForm,
  validateKpiForm,
} from "./components/KpiEditorModal.jsx";
import TargetAllocationMatrix from "./components/TargetAllocationMatrix.jsx";
import TargetAllocationModal from "./components/TargetAllocationModal.jsx";
import KpiChartsSection from "./components/KpiChartsSection.jsx";
import { getLocalDateInputValue } from "./components/formatting.js";
import {
  PARAMETER_FORM_DEFAULTS,
  allocationToParameterForm,
  buildParameterPayload,
  doesParameterRowMatchAllocationIds,
  getAllocationKpiName,
  getAllocationSubjectName,
  getParameterAllocationIdsForDelete,
  groupParameterAllocationRows,
  mergeParameterAllocationCollections,
  normalizeParameterAllocationIdList,
  validateParameterForm,
} from "./components/allocationHelpers.js";

// React migration of GET /responsible/:responsibleId/dashboard
// (KPI-Group/index.js:8548-24318 -- 15771 lines, the largest route of the
// monolith). It is a responsible's personal admin console with three views:
//   * Consult KPI                -> KPI Matrix (KPI definitions CRUD + duplicate)
//   * My KPI Analytics           -> monthly charts per KPI
//   * Consult Target Allocation  -> KPI target allocation matrix (CRUD)
// plus the KPI create/edit modal, the read-only KPI details modal and the KPI
// target allocation modal with its multisite unit matrix.
//
// Backend endpoints used (all pre-existing except the two noted):
//   GET    /api/responsibles/:id/dashboard-context   (NEW -- roleOptions +
//          allocationLookups + subject hierarchy, previously inlined into the page's markup)
//   GET    /api/responsibles/:id/kpis?include_all=1&search=
//   GET    /api/responsibles/:id/kpis/:kpiId?include_all=1
//   GET    /api/kpis/:kpiId
//   POST   /api/responsibles/:id/kpis
//   PUT    /api/kpis/:kpiId
//   DELETE /api/kpis/:kpiId
//   GET    /api/responsibles/:id/kpi-objects?scope=all
//   GET    /api/responsibles/:id/kpi-objects/:allocationId?scope=all
//   POST   /api/responsibles/:id/kpi-objects
//   PUT    /api/responsibles/:id/kpi-objects/:allocationId
//   DELETE /api/responsibles/:id/kpi-objects/:allocationId
//   GET    /api/responsibles/:id/kpi-monthly-series  (NEW -- live replacement
//          for the dead kpi-history-monthly endpoint, see KpiChartsSection)

const VIEW_HASH = {
  dashboard: "#dashboard",
  "my-kpis": "#my-kpis",
  "consult-target-allocation": "#consult-target-allocation",
};

const HASH_VIEW = {
  "#dashboard": "dashboard",
  "#consult-kpi": "dashboard",
  "#my-kpis": "my-kpis",
  "#analytics": "my-kpis",
  "#consult-target-allocation": "consult-target-allocation",
  "#allocations": "consult-target-allocation",
};

function readStoredView(storageKey) {
  const normalizedHash = String(window.location.hash || "").trim().toLowerCase();
  if (HASH_VIEW[normalizedHash]) return HASH_VIEW[normalizedHash];
  try {
    const storedView = String(window.localStorage.getItem(storageKey) || "")
      .trim()
      .toLowerCase();
    if (VIEW_HASH[storedView]) return storedView;
  } catch {
    // localStorage unavailable -- fall through to the default view.
  }
  return "dashboard";
}

const NAV_ITEMS = [
  { view: "dashboard", icon: "📊", label: "Consult KPI" },
  { view: "my-kpis", icon: "📈", label: "My KPI Analytics" },
  { view: "consult-target-allocation", icon: "📁", label: "Consult Target Allocation" },
];

export default function ResponsibleDashboardPage() {
  const { responsibleId: routeResponsibleId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const responsibleId = String(routeResponsibleId || "");
  const storageKey = `responsible-dashboard-view:${responsibleId}`;

  const [view, setView] = useState(() => readStoredView(storageKey));

  // A link to a view while the page is open (e.g. "#my-kpis" from the AI
  // Assistant) switches to it. location.key: the same link twice still does.
  const location = useLocation();
  useEffect(() => {
    const linkedView = HASH_VIEW[String(location.hash || "").trim().toLowerCase()];
    if (linkedView) setView(linkedView);
  }, [location.key, location.hash]);

  // Below lg the sidebar is hidden: the ☰ button opens it as a drawer. While open, the page
  // behind does not scroll; Escape, the backdrop, the close button, any action of the menu or
  // widening the window back to the desktop layout closes it.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuButtonRef = useRef(null);
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const menuButton = menuButtonRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onLayoutChange = (event) => {
      if (event.matches) setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onLayoutChange);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onLayoutChange);
      menuButton?.focus({ preventScroll: true });
    };
  }, [mobileNavOpen]);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  // Shared with the other signed-in pages (administration, password change).
  const { darkMode, toggleDarkMode } = useTheme();

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2400);
  }, []);

  // ---- bootstrap context (roleOptions + allocationLookups + responsible) ----
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get(`/api/responsibles/${responsibleId}/dashboard-context`)
      .then((res) => {
        if (!cancelled) setContext(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setContextError(err.response?.data?.error || "Failed to load the dashboard context.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [responsibleId]);

  const ctx = useMemo(
    () => ({
      lookups: context?.allocation_lookups || {},
      roleOptions: context?.role_options || [],
    }),
    [context]
  );
  const responsibleName = context?.responsible?.name || "KPI Workspace";
  const dashboardResponsibleId = String(context?.responsible?.people_id || responsibleId);

  // Report Dashboard (CEO report) is restricted to the CEO and the KPI admin --
  // the same two people the original access was scoped to.
  const REPORT_DASHBOARD_ALLOWED_NAMES = ["olivier spicker", "ahmed horri"];
  const canViewReportDashboard = REPORT_DASHBOARD_ALLOWED_NAMES.includes(
    String(responsibleName || "").trim().toLowerCase()
  );
  const [reportPlantPickerOpen, setReportPlantPickerOpen] = useState(false);
  const reportPlantOptions = ctx.lookups.plants || [];

  // Training Session Dashboard (the training results of every responsible, unfiltered) is shown
  // to the administrators, the CEO and the VPs (roles "CEO", "VP Finance", "VP Operation", ...).
  const { isAdmin } = useAuth();
  const canViewTrainingSessionDashboard =
    isAdmin || /^(ceo|vp)\b/i.test(String(context?.responsible?.role_name || "").trim());

  // ---- view persistence ----
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, view);
    } catch {
      // Ignore storage failures; the hash still reflects the current view.
    }
    const targetHash = VIEW_HASH[view] || VIEW_HASH.dashboard;
    if (window.location.hash !== targetHash) {
      const nextUrl = new URL(window.location.href);
      nextUrl.hash = targetHash;
      window.history.replaceState({}, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
    }
  }, [view, storageKey]);

  // ---- KPI matrix state ----
  const [kpiRows, setKpiRows] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiSearch, setKpiSearch] = useState("");
  const [kpiNameFilter, setKpiNameFilter] = useState("");
  const [kpiSubjectFilter, setKpiSubjectFilter] = useState("");
  const [expandedKpiKeys, setExpandedKpiKeys] = useState(() => new Set());
  const [duplicatingId, setDuplicatingId] = useState(null);

  const loadKpis = useCallback(
    async (search = "") => {
      setKpiLoading(true);
      try {
        const res = await apiClient.get(`/api/responsibles/${responsibleId}/kpis`, {
          params: { include_all: 1, search },
        });
        setKpiRows(Array.isArray(res.data) ? res.data : []);
      } catch {
        setKpiRows([]);
        showToast("Failed to load KPIs.");
      } finally {
        setKpiLoading(false);
      }
    },
    [responsibleId, showToast]
  );

  // loadReferenceKpis() / loadKpiNames() in the original always fetch the
  // unfiltered list (search=""), independently of the KPI Matrix search box.
  // It feeds the Reference KPI dropdown and the allocation modal's KPI list.
  const [kpiCatalog, setKpiCatalog] = useState([]);

  const loadKpiCatalog = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/responsibles/${responsibleId}/kpis`, {
        params: { include_all: 1, search: "" },
      });
      setKpiCatalog(Array.isArray(res.data) ? res.data : []);
    } catch {
      setKpiCatalog([]);
    }
  }, [responsibleId]);

  useEffect(() => {
    loadKpis("");
    loadKpiCatalog();
  }, [loadKpis, loadKpiCatalog]);

  useEffect(() => {
    const handle = window.setTimeout(() => loadKpis(kpiSearch), 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpiSearch]);

  // The filter option lists are rebuilt from the loaded rows: drop a selection
  // that no longer exists (initializeKpiConsultFilters in the original).
  useEffect(() => {
    if (
      kpiNameFilter &&
      !kpiRows.some((row) => String(row.indicator_sub_title || "").trim() === kpiNameFilter)
    ) {
      setKpiNameFilter("");
    }
  }, [kpiRows, kpiNameFilter]);

  const isKpiOwnedByResponsible = useCallback(
    (kpi = {}) =>
      typeof kpi?.is_owned_by_responsible === "boolean"
        ? kpi.is_owned_by_responsible
        : String(kpi.created_by_people_id || "") === String(dashboardResponsibleId || ""),
    [dashboardResponsibleId]
  );

  // ---- target allocation state ----
  const [allocationRows, setAllocationRows] = useState([]);
  const [allocationLoading, setAllocationLoading] = useState(true);
  const [allocationLoadError, setAllocationLoadError] = useState(false);
  const [allocationSearch, setAllocationSearch] = useState("");
  const [allocationNameFilter, setAllocationNameFilter] = useState("");
  const [allocationSubjectFilter, setAllocationSubjectFilter] = useState("");
  const [expandedAllocationKeys, setExpandedAllocationKeys] = useState(() => new Set());

  // As for the KPI Matrix: drop a filter value no longer present in the reloaded rows.
  useEffect(() => {
    if (allocationNameFilter && !allocationRows.some((row) => getAllocationKpiName(row) === allocationNameFilter)) {
      setAllocationNameFilter("");
    }
    if (
      allocationSubjectFilter &&
      !allocationRows.some((row) => getAllocationSubjectName(row) === allocationSubjectFilter)
    ) {
      setAllocationSubjectFilter("");
    }
  }, [allocationRows, allocationNameFilter, allocationSubjectFilter]);

  const loadAllocations = useCallback(async () => {
    setAllocationLoading(true);
    setAllocationLoadError(false);
    try {
      const res = await apiClient.get(`/api/responsibles/${responsibleId}/kpi-objects`, {
        params: { scope: "all" },
      });
      setAllocationRows(groupParameterAllocationRows(Array.isArray(res.data) ? res.data : []));
    } catch {
      setAllocationRows([]);
      setAllocationLoadError(true);
    } finally {
      setAllocationLoading(false);
    }
  }, [responsibleId]);

  useEffect(() => {
    loadAllocations();
  }, [loadAllocations]);

  // ---- KPI editor modal ----
  const [kpiForm, setKpiForm] = useState(KPI_CREATE_DEFAULTS);
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  const [kpiSaving, setKpiSaving] = useState(false);
  const [kpiDetails, setKpiDetails] = useState(null);
  const [kpiPendingDeleteId, setKpiPendingDeleteId] = useState(null);
  const [kpiPendingFile, setKpiPendingFile] = useState(null);
  // captureKpiCreateDraft() / restoreKpiCreateDraft(): closing the CREATE modal
  // keeps what was typed; reopening "Create KPI" restores it. Cleared on a
  // successful create. Edits are never drafted.
  const [kpiCreateDraft, setKpiCreateDraft] = useState(null);

  const openCreateKpiModal = () => {
    setKpiForm(kpiCreateDraft || KPI_CREATE_DEFAULTS);
    setKpiModalOpen(true);
  };

  const dismissKpiModal = () => {
    if (kpiSaving) return;
    if (!kpiForm.kpi_id) setKpiCreateDraft(kpiForm);
    else setKpiPendingFile(null);
    setKpiModalOpen(false);
  };

  const openEditKpiModal = useCallback(
    async (kpiId) => {
      try {
        const res = await apiClient.get(`/api/kpis/${kpiId}`);
        setKpiForm(kpiRowToForm(res.data));
        setKpiPendingFile(null);
        setKpiModalOpen(true);
      } catch (err) {
        showToast(`Unable to load KPI: ${err.response?.data?.error || err.message}`);
      }
    },
    [showToast]
  );

  const openKpiDetails = async (kpiId) => {
    try {
      const res = await apiClient.get(`/api/responsibles/${responsibleId}/kpis/${kpiId}`, {
        params: { include_all: 1 },
      });
      setKpiDetails(res.data);
    } catch (err) {
      showToast(`Unable to load KPI details: ${err.response?.data?.error || err.message}`);
    }
  };

  const saveKpi = async (pendingFile) => {
    const validationError = validateKpiForm(kpiForm);
    if (validationError) {
      showToast(validationError);
      return;
    }

    setKpiSaving(true);
    try {
      const payload = await buildKpiPayload(kpiForm, pendingFile);
      const isCreateMode = !kpiForm.kpi_id;
      const res = isCreateMode
        ? await apiClient.post(`/api/responsibles/${responsibleId}/kpis`, payload)
        : await apiClient.put(`/api/kpis/${kpiForm.kpi_id}`, payload);

      if (isCreateMode) setKpiCreateDraft(null);
      setKpiPendingFile(null);
      setKpiModalOpen(false);
      await loadKpis(kpiSearch);
      await loadKpiCatalog();
      if (isCreateMode && res.data?.kpi_id) {
        setView("dashboard");
        showToast("KPI created successfully");
        return;
      }
      showToast(isCreateMode ? "KPI created successfully" : "KPI updated successfully");
    } catch (err) {
      showToast(err.response?.data?.error || `Save failed: ${err.message}`);
    } finally {
      setKpiSaving(false);
    }
  };

  const confirmKpiDelete = async () => {
    const kpiId = kpiPendingDeleteId;
    setKpiPendingDeleteId(null);
    try {
      await apiClient.delete(`/api/kpis/${kpiId}`);
      if (String(kpiForm.kpi_id) === String(kpiId)) setKpiModalOpen(false);
      await loadKpis(kpiSearch);
      await loadKpiCatalog();
      await loadAllocations();
      showToast("KPI deleted successfully");
    } catch (err) {
      showToast(err.response?.data?.error || "Delete failed");
    }
  };

  // buildDuplicateKpiPayload() + duplicateKpi()
  const duplicateKpi = async (kpiId) => {
    if (!kpiId) return;
    setDuplicatingId(kpiId);
    try {
      const res = await apiClient.get(`/api/kpis/${kpiId}`);
      const data = res.data || {};
      const duplicatedName = String(data.indicator_sub_title || "").trim()
        ? `${String(data.indicator_sub_title).trim()} (Copy)`
        : "Untitled KPI (Copy)";

      await apiClient.post(`/api/responsibles/${responsibleId}/kpis`, {
        is_duplicate: true,
        source_kpi_id: data.kpi_id,
        kfs: data.kfs || "KPI",
        indicator_title: data.indicator_title || "",
        indicator_sub_title: duplicatedName,
        subject: data.subject || "",
        subject_node_id: data.subject_node_id || "",
        kpi_code: "",
        kpi_formula: data.kpi_formula || "",
        unit: data.unit || "",
        definition: data.definition || "",
        frequency: data.frequency || "",
        target: data.target ?? "",
        tolerance_type: data.tolerance_type || "",
        up_tolerance: data.up_tolerance ?? "",
        low_tolerance: data.low_tolerance ?? "",
        max: data.max ?? "",
        min: data.min ?? "",
        calculation_on: data.calculation_on || "",
        target_auto_adjustment: data.target_auto_adjustment || "",
        reactivity_status: data.reactivity_status || "",
        importance: data.importance || "",
        pricing_type: data.pricing_type || "",
        reactivity_need: data.reactivity_need || "",
        direction: data.target_direction || "",
        nombre_periode: data.nombre_periode || "",
        calculation_mode: data.calculation_mode || "",
        reference_kpi_id: data.reference_kpi_id ?? "",
        display_trend: data.display_trend || "",
        regression: data.regression || "",
        min_type: data.min_type || "",
        max_type: data.max_type || "",
        status: data.status || "Active",
        comments: data.comments || "",
        owner_role_id: data.owner_role_id ?? "",
        high_limit: data.high_limit ?? "",
        low_limit: data.low_limit ?? "",
        file_source_path: data.file || "",
        file_source_name: data.file_name || "",
      });

      await loadKpis(kpiSearch);
      await loadKpiCatalog();
      showToast("KPI duplicated successfully");
    } catch (err) {
      showToast(err.response?.data?.error || `Unable to duplicate KPI: ${err.message}`);
    } finally {
      setDuplicatingId(null);
    }
  };

  // ---- target allocation modal ----
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [allocationForm, setAllocationForm] = useState(PARAMETER_FORM_DEFAULTS);
  const [allocationUnitState, setAllocationUnitState] = useState({});
  const [allocationEditMode, setAllocationEditMode] = useState(false);
  const [allocationEditRows, setAllocationEditRows] = useState([]);
  const [allocationLockedUnitId, setAllocationLockedUnitId] = useState("");
  const [allocationSaving, setAllocationSaving] = useState(false);
  const [allocationPendingDelete, setAllocationPendingDelete] = useState(null);
  // captureParameterCreateDraft() / restoreParameterCreateDraft(): same draft
  // behaviour as the KPI modal, including the per-row target state.
  const [allocationCreateDraft, setAllocationCreateDraft] = useState(null);

  const openCreateAllocationModal = () => {
    if (allocationCreateDraft) {
      setAllocationForm(allocationCreateDraft.form);
      setAllocationUnitState(allocationCreateDraft.unitState);
      setAllocationLockedUnitId(allocationCreateDraft.lockedUnitId);
      setAllocationEditMode(false);
      setAllocationEditRows([]);
      setAllocationModalOpen(true);
      return;
    }

    const defaultResponsiblePeopleId = (ctx.lookups.people || []).some(
      (option) => String(option?.value || "") === String(dashboardResponsibleId || "")
    )
      ? dashboardResponsibleId
      : "";

    setAllocationForm({
      ...PARAMETER_FORM_DEFAULTS,
      parameter_target_setup_date: getLocalDateInputValue(),
      parameter_target_status: "Draft",
      parameter_set_by_people_id: defaultResponsiblePeopleId,
    });
    setAllocationUnitState({});
    setAllocationEditMode(false);
    setAllocationEditRows([]);
    setAllocationLockedUnitId("");
    setAllocationModalOpen(true);
  };

  const dismissAllocationModal = () => {
    if (allocationSaving) return;
    if (!allocationEditMode && !allocationForm.parameter_object_id) {
      setAllocationCreateDraft({
        form: allocationForm,
        unitState: allocationUnitState,
        lockedUnitId: allocationLockedUnitId,
      });
    }
    setAllocationModalOpen(false);
  };

  const openEditAllocationModal = async (allocationId) => {
    try {
      const groupedRow = allocationRows.find(
        (row) => String(row?.kpi_target_allocation_id || "") === String(allocationId || "")
      );
      const groupedAllocations = Array.isArray(groupedRow?.related_allocations)
        ? groupedRow.related_allocations
        : [];

      const res = await apiClient.get(
        `/api/responsibles/${responsibleId}/kpi-objects/${allocationId}`,
        { params: { scope: "all" } }
      );
      const data = res.data;
      const apiRelated = Array.isArray(data?.related_allocations) ? data.related_allocations : [];
      const merged = mergeParameterAllocationCollections(
        groupedAllocations,
        apiRelated.length ? apiRelated : [data]
      );

      const mapped = allocationToParameterForm(ctx.lookups, {
        ...data,
        related_allocations: merged.length ? merged : apiRelated.length ? apiRelated : groupedAllocations,
      });

      setAllocationForm(mapped.form);
      setAllocationUnitState(mapped.unitState);
      setAllocationEditRows(mapped.relatedAllocations);
      setAllocationLockedUnitId(mapped.lockedUnitId);
      setAllocationEditMode(true);
      setAllocationModalOpen(true);
    } catch (err) {
      showToast(
        `Unable to load KPI target allocation: ${err.response?.data?.error || err.message}`
      );
    }
  };

  const saveAllocation = async (resolvedIndividualResponsibleId) => {
    // The Individual responsible can be auto-resolved from unit + role without
    // the user touching the select; make that resolution explicit on save.
    const formForSave =
      resolvedIndividualResponsibleId && !allocationForm.parameter_set_by_people_id
        ? { ...allocationForm, parameter_set_by_people_id: resolvedIndividualResponsibleId }
        : allocationForm;

    const validationError = validateParameterForm(ctx, formForSave, allocationUnitState, {
      lockedUnitId: allocationLockedUnitId,
      editMode: allocationEditMode,
      editAllocations: allocationEditRows,
    });
    if (validationError) {
      showToast(validationError);
      return;
    }

    const existingAllocationIds = getParameterAllocationIdsForDelete(
      [allocationRows],
      formForSave.parameter_object_id,
      { preferFormState: true, unitState: allocationUnitState }
    );

    const payload = buildParameterPayload(ctx, formForSave, allocationUnitState, {
      lockedUnitId: allocationLockedUnitId,
      editMode: allocationEditMode,
      editAllocations: allocationEditRows,
      kpiCatalog,
      existingAllocationIds,
    });

    if (String(formForSave.parameter_kpi_type || "").toLowerCase() === "role" && !payload.unit_allocations.length) {
      showToast("No valid unit found for this role. Check people-role assignment unit_id.");
      return;
    }

    setAllocationSaving(true);
    try {
      const allocationId = formForSave.parameter_object_id;
      if (allocationId) {
        await apiClient.put(
          `/api/responsibles/${responsibleId}/kpi-objects/${allocationId}`,
          payload
        );
      } else {
        await apiClient.post(`/api/responsibles/${responsibleId}/kpi-objects`, payload);
        setAllocationCreateDraft(null);
      }

      setAllocationModalOpen(false);
      await loadAllocations();

      if (allocationId) {
        showToast("KPI target allocation updated");
        return;
      }
      showToast("KPI target allocation created");
      setView("consult-target-allocation");
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to save KPI target allocation");
    } finally {
      setAllocationSaving(false);
    }
  };

  const requestAllocationDelete = (allocationId, { fromModal = false } = {}) => {
    const allocationIds = fromModal
      ? getParameterAllocationIdsForDelete([allocationRows], allocationId, {
          preferFormState: true,
          unitState: allocationUnitState,
        })
      : getParameterAllocationIdsForDelete([allocationRows], allocationId);
    setAllocationPendingDelete({ allocationId, allocationIds, fromModal });
  };

  const confirmAllocationDelete = async () => {
    const pending = allocationPendingDelete;
    setAllocationPendingDelete(null);
    if (!pending) return;

    const allocationIds = normalizeParameterAllocationIdList(pending.allocationIds);
    try {
      const res = await apiClient.delete(
        `/api/responsibles/${responsibleId}/kpi-objects/${pending.allocationId}`,
        allocationIds.length ? { data: { allocation_ids: allocationIds } } : undefined
      );

      const removedIds = normalizeParameterAllocationIdList(res.data?.deleted_ids || []);
      const idsToRemove = removedIds.length ? removedIds : allocationIds;
      setAllocationRows((prev) =>
        prev.filter((row) => !doesParameterRowMatchAllocationIds(row, idsToRemove))
      );

      if (pending.fromModal) setAllocationModalOpen(false);
      showToast("KPI target allocation deleted");
    } catch (err) {
      showToast(err.response?.data?.error || "Delete failed");
    }
  };

  // ---- ?editKpi=<id> deep link (GET /responsible/:id/kpis/:kpiId/edit) ----
  const editKpiParam = searchParams.get("editKpi");
  useEffect(() => {
    if (!editKpiParam) return;
    openEditKpiModal(editKpiParam).finally(() => {
      const next = new URLSearchParams(searchParams);
      next.delete("editKpi");
      setSearchParams(next, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKpiParam]);

  const toggleSetItem = (setState) => (key) =>
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // The sidebar: the left column on wide screens, and below lg a drawer opened by the ☰ button
  // (like the APQP workspace). Its actions close the drawer.
  const sidebarContent = (
    <>
      <div>
        <div className="mb-3 flex flex-col gap-2">
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl btn-brand px-3 py-2.5 text-left text-sm font-bold shadow-lg shadow-black/20 transition hover:-translate-y-0.5"
            onClick={() => {
              setMobileNavOpen(false);
              openCreateKpiModal();
            }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/15 text-xs">+</span>
            <span>Create KPI</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl border border-blue-800 bg-blue-900/60 px-3 py-2.5 text-left text-sm font-bold text-blue-50 transition hover:border-blue-700 hover:bg-blue-900"
            onClick={() => {
              setMobileNavOpen(false);
              openCreateAllocationModal();
            }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 text-xs">🧭</span>
            <span>Create Target Allocation</span>
          </button>
        </div>

        <div className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-widest text-blue-400">
          Navigation
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = view === item.view;
            return (
              <button
                key={item.view}
                type="button"
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                  active ? "bg-blue-900 text-white" : "text-blue-200 hover:bg-blue-900/60 hover:text-white"
                }`}
                onClick={() => {
                  setMobileNavOpen(false);
                  setView(item.view);
                }}
              >
                {active ? (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-orange-500" />
                ) : null}
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-widest text-blue-400">
          Other Dashboards
        </div>
        <nav className="flex flex-col gap-1">
          {canViewTrainingSessionDashboard ? (
            <Link
              to="/kpi-training-dashboard"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-blue-200 transition hover:bg-blue-900/60 hover:text-white"
            >
              <span>🎓</span>
              <span>Training Session Dashboard</span>
            </Link>
          ) : null}
          <Link
            to={`/kpi-training-center?people_id=${encodeURIComponent(dashboardResponsibleId)}`}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-blue-200 transition hover:bg-blue-900/60 hover:text-white"
          >
            <span>📚</span>
            <span>KPI Training Center</span>
          </Link>
          <Link
            to={`/form?responsible_id=${encodeURIComponent(dashboardResponsibleId)}`}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-blue-200 transition hover:bg-blue-900/60 hover:text-white"
          >
            <span>📝</span>
            <span>KPI Submission Dashboard</span>
          </Link>
          {canViewReportDashboard ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setReportPlantPickerOpen((current) => !current)}
                aria-expanded={reportPlantPickerOpen}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-blue-200 transition hover:bg-blue-900/60 hover:text-white"
              >
                <span>📑</span>
                <span className="flex-1">Report Dashboard</span>
                <span className={`text-xs transition-transform ${reportPlantPickerOpen ? "rotate-90" : ""}`}>▸</span>
              </button>
              {reportPlantPickerOpen ? (
                <div className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-blue-900 bg-blue-900/60 p-1.5">
                  {reportPlantOptions.length ? (
                    reportPlantOptions.map((plant) => (
                      <Link
                        key={plant.value}
                        to={`/ceo-report/plants/${encodeURIComponent(plant.value)}`}
                        className="block rounded-lg px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-800 hover:text-white"
                      >
                        {plant.label}
                      </Link>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-blue-300">No plants found.</div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-xl border border-blue-900 bg-blue-900/40 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold text-blue-100">
            <span>{darkMode ? "🌙" : "☀️"}</span>
            Dark Mode
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={darkMode}
            aria-label="Toggle dark mode"
            onClick={toggleDarkMode}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              darkMode ? "bg-blue-600" : "bg-blue-800"
            }`}
          >
            <span
              className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                darkMode ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div className="rounded-2xl border border-blue-900 bg-blue-900/40 p-4">
          <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
            {(responsibleName || "?")
              .split(" ")
              .map((part) => part[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{responsibleName}</div>
            <div className="text-[11px] text-blue-300">Responsible workspace</div>
          </div>
        </div>
          <p className="mt-3 text-xs leading-relaxed text-blue-200">
            Manage KPI definitions, update targets and keep your performance indicators organized in
            one modern dashboard.
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sticks below the app's top bar (AppLayout, h-14), which stays in view. */}
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-72 shrink-0 flex-col justify-between overflow-y-auto bg-blue-950 p-6 text-blue-100 [color-scheme:dark] [scrollbar-color:var(--color-blue-800)_transparent] lg:flex dark:border-r dark:border-slate-800">
        {sidebarContent}
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-kpi-fade"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="KPI workspace menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between gap-6 overflow-y-auto bg-blue-950 p-6 pt-14 text-blue-100 [color-scheme:dark] [scrollbar-color:var(--color-blue-800)_transparent] shadow-2xl shadow-black/40 animate-kpi-drawer"
          >
            <button
              type="button"
              autoFocus
              aria-label="Close menu"
              onClick={() => setMobileNavOpen(false)}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-blue-200 transition hover:bg-blue-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <CloseIcon size={18} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 p-6 lg:p-8">
        {/* Below lg: the ☰ button of the menu, kept in view under the app's top bar (h-14). */}
        <div className="sticky top-14 z-20 -mx-6 -mt-6 mb-6 flex items-center gap-3 border-b border-slate-200 bg-slate-50/95 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-slate-300 dark:focus-visible:ring-blue-500/40 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <MenuIcon size={20} />
          </button>
          <span className="text-xs text-slate-400 dark:text-slate-500">KPI workspace</span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
            {NAV_ITEMS.find((item) => item.view === view)?.label || "Consult KPI"}
          </span>
        </div>

        <BoardTitle
          className="mb-6"
          icon={DashboardIcon}
          eyebrow="KPI workspace"
          title="Responsible KPI"
          subtitle={
            <>
              Modern KPI workspace for {responsibleName}. KPI creation stays linked to this
              responsible, while target allocation consulting can review and manage all allocations.
            </>
          }
        />

        {/* Mobile / narrow nav */}
        <div className="mb-6 flex flex-wrap gap-2 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              type="button"
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                view === item.view
                  ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
                  : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
              onClick={() => setView(item.view)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {contextError ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {contextError}
          </div>
        ) : null}

        {view === "dashboard" ? (
          <KpiMatrix
            sourceRows={kpiRows}
            search={kpiSearch}
            onSearchChange={setKpiSearch}
            nameFilter={kpiNameFilter}
            onNameFilterChange={setKpiNameFilter}
            subjectFilter={kpiSubjectFilter}
            onSubjectFilterChange={setKpiSubjectFilter}
            expandedKeys={expandedKpiKeys}
            onToggleGroup={toggleSetItem(setExpandedKpiKeys)}
            loading={kpiLoading}
            isOwned={isKpiOwnedByResponsible}
            onAdd={openCreateKpiModal}
            onView={openKpiDetails}
            onEdit={openEditKpiModal}
            onDelete={setKpiPendingDeleteId}
            onDuplicate={duplicateKpi}
            duplicatingId={duplicatingId}
          />
        ) : null}

        {view === "my-kpis" ? <KpiChartsSection responsibleId={responsibleId} /> : null}

        {view === "consult-target-allocation" ? (
          <TargetAllocationMatrix
            sourceRows={allocationRows}
            search={allocationSearch}
            onSearchChange={setAllocationSearch}
            nameFilter={allocationNameFilter}
            onNameFilterChange={setAllocationNameFilter}
            subjectFilter={allocationSubjectFilter}
            onSubjectFilterChange={setAllocationSubjectFilter}
            expandedKeys={expandedAllocationKeys}
            onToggleGroup={toggleSetItem(setExpandedAllocationKeys)}
            loading={allocationLoading}
            loadError={allocationLoadError}
            onAdd={openCreateAllocationModal}
            onEdit={openEditAllocationModal}
            onDelete={(id) => requestAllocationDelete(id)}
          />
        ) : null}
      </main>

      {kpiModalOpen ? (
        <KpiEditorModal
          form={kpiForm}
          setForm={setKpiForm}
          isEdit={Boolean(kpiForm.kpi_id)}
          saving={kpiSaving}
          referenceKpiRows={kpiCatalog}
          roleOptions={ctx.roleOptions}
          subjectTree={context?.subject_hierarchy || []}
          subjectsLoading={!context && !contextError}
          subjectsError={contextError}
          responsibleName={responsibleName}
          pendingFile={kpiPendingFile}
          setPendingFile={setKpiPendingFile}
          onSave={saveKpi}
          onDelete={() => setKpiPendingDeleteId(kpiForm.kpi_id)}
          onClose={dismissKpiModal}
          onToast={showToast}
        />
      ) : null}

      {kpiDetails ? <KpiDetailsModal kpi={kpiDetails} onClose={() => setKpiDetails(null)} /> : null}

      {allocationModalOpen ? (
        <TargetAllocationModal
          ctx={ctx}
          kpiCatalog={kpiCatalog}
          form={allocationForm}
          setForm={setAllocationForm}
          unitState={allocationUnitState}
          setUnitState={setAllocationUnitState}
          editMode={allocationEditMode}
          editAllocations={allocationEditRows}
          lockedUnitId={allocationLockedUnitId}
          saving={allocationSaving}
          onSave={saveAllocation}
          onDelete={() =>
            requestAllocationDelete(allocationForm.parameter_object_id, { fromModal: true })
          }
          onClose={dismissAllocationModal}
        />
      ) : null}

      {kpiPendingDeleteId ? (
        <ConfirmDialog
          title="Delete KPI?"
          description="This KPI and its linked target allocations, KPI results, and assistant conversations will be removed."
          warning="This action cannot be undone."
          confirmLabel="Delete KPI"
          onCancel={() => setKpiPendingDeleteId(null)}
          onConfirm={confirmKpiDelete}
        />
      ) : null}

      {allocationPendingDelete ? (
        <ConfirmDialog
          title="Delete target allocation?"
          description={
            allocationPendingDelete.allocationIds.length > 1
              ? `This KPI target allocation and all ${allocationPendingDelete.allocationIds.length} linked unit rows will be removed.`
              : "This KPI target allocation will be removed."
          }
          warning="This action cannot be undone."
          confirmLabel="Delete allocation"
          onCancel={() => setAllocationPendingDelete(null)}
          onConfirm={confirmAllocationDelete}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 right-6 z-[80] rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl dark:bg-slate-700">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
