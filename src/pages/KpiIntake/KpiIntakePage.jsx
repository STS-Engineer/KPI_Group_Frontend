import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import apiClient, { getApiErrorMessage } from "../../api/client";
import BoardTitle from "../../components/BoardTitle.jsx";
import { useAuth } from "../../auth/AuthContext";
import { buttonClasses, ConfirmDialog, Spinner } from "../../components/Dialog.jsx";
import {
  AlertIcon,
  BriefcaseIcon,
  ChartIcon,
  CheckCircleIcon,
  CheckIcon,
  ClipboardIcon,
  CloseIcon,
  FactoryIcon,
  LoginIcon,
  PlusIcon,
  RefreshIcon,
  SaveIcon,
  SearchIcon,
  SendIcon,
  ShieldIcon,
  TargetIcon,
  TrashIcon,
} from "../../components/icons.jsx";
import IntakeGrid from "./components/IntakeGrid.jsx";
import PasteDialog from "./components/PasteDialog.jsx";
import ReferenceInput from "./components/ReferenceInput.jsx";
import SubmitReviewDialog from "./components/SubmitReviewDialog.jsx";
import SelectMenu from "../../components/SelectMenu.jsx";
import {
  attachRecords,
  cellText,
  coerceCell,
  defaultValues,
  ENTITY_OF_TAB,
  ENTITY_TYPES,
  fromServerLine,
  isEmptyValue,
  isLineDirty,
  isLineEmpty,
  linesToSave,
  mergeServerLines,
  newLine,
  normalizeText,
  RECORD_NOUN,
  recordLine,
  TAB_OF_ENTITY,
} from "./intakeUtils.js";

const TABS = [
  { entityType: "kpi", label: "KPI", noun: "KPI", plural: "KPIs", icon: ChartIcon },
  {
    entityType: "target_allocation",
    label: "Target Allocation",
    noun: "target allocation",
    plural: "target allocations",
    icon: TargetIcon,
  },
];

// Rows shown at a time: there are a thousand target allocations.
const PAGE_SIZE = 50;

// The person who enters lines is remembered on this browser.
const SUBMITTED_BY_KEY = "kpi-intake-submitted-by";

const readStoredPerson = () => {
  try {
    const person = JSON.parse(window.localStorage.getItem(SUBMITTED_BY_KEY) || "null");
    return person?.id && person?.label ? { id: person.id, label: person.label } : undefined;
  } catch {
    return undefined;
  }
};

const storePerson = (person) => {
  try {
    if (person?.id) window.localStorage.setItem(SUBMITTED_BY_KEY, JSON.stringify({ id: person.id, label: person.label }));
    else window.localStorage.removeItem(SUBMITTED_BY_KEY);
  } catch {
    // Storage unavailable (private window): the name is simply asked again.
  }
};

const SEARCHES = {
  people: async (term) => (await apiClient.get("/api/kpi-intake/people", { params: { search: term } })).data.results,
  customer: async (term) => (await apiClient.get("/api/kpi-intake/customers", { params: { search: term } })).data.results,
};

const fetchLines = async (entityType, view = "open") =>
  (await apiClient.get("/api/kpi-intake/lines", { params: { entity: entityType, view } })).data.lines;

const fetchRecords = async (entityType) =>
  (await apiClient.get("/api/kpi-intake/records", { params: { entity: entityType } })).data.records;

const NOTICE_TONES = {
  success: "border-emerald-100 dark:border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  warning: "border-amber-100 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200",
  error: "border-red-100 dark:border-red-500/30 bg-red-50/80 dark:bg-red-500/10 text-red-800 dark:text-red-300",
  info: "border-blue-100 dark:border-blue-500/30 bg-blue-50/70 dark:bg-blue-500/10 text-slate-700 dark:text-slate-200",
};

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// How a line goes from this page to the KPI tables, as the header tells it.
const intakeSteps = ({ canSeeRecords, isAdmin }) => [
  canSeeRecords
    ? { title: "Change or add", text: "Edit any cell of a KPI or allocation, or add a line. Type names — they are matched to the database." }
    : { title: "Add lines", text: "One new KPI or target allocation per line. Type names — the KPI, the plant, the person." },
  { title: "Save", text: "Your lines wait for review. Nothing changes in the database yet." },
  isAdmin
    ? { title: "You submit", text: "With Review & submit, at the bottom: the ready lines are written, all in one go — or rejected." }
    : {
      title: "An administrator submits",
      text: canSeeRecords
        ? "Only the cells you changed are written — or the line is rejected, with a comment."
        : "The lines are written to the KPI tables — or rejected, with a comment.",
    },
];

// Filters above a grid: its lines narrowed to one value of a reference column.
const GRID_FILTERS = {
  target_allocation: [
    { key: "unit_id", label: "Unit", icon: FactoryIcon, all: "All units", none: "No unit" },
    { key: "role_id", label: "Role", icon: BriefcaseIcon, all: "All roles", none: "No role" },
  ],
};
const NO_FILTERS = [];
const NO_VALUE = "__none__";

// A cell as a filter value: the record picked, else the name typed.
const filterValueOf = (value) => {
  if (isEmptyValue(value)) return NO_VALUE;
  if (typeof value === "object" && value.id) return `id:${value.id}`;
  return `text:${normalizeText(cellText(value))}`;
};

// Text a line is found by: its cells, its numbers, who created it.
const searchText = (line, record) =>
  normalizeText(
    [
      ...Object.values(line.values || {}).map(cellText),
      line.record_id ? `#${line.record_id}` : "",
      line.intake_id ? `#${line.intake_id}` : "",
      record?.info?.created_by || "",
    ].join(" ")
  );

// KPI & Target Intake: responsibles enter new KPIs and target allocations with
// names; signed-in users also see the ones already in the database and change
// them. An administrator reviews the lines and submits them to the KPI tables.
// Open to anyone with the link, like the other pages reached from an e-mail.
export default function KpiIntakePage() {
  const { isAdmin, status: authStatus, user } = useAuth();
  const canSeeRecords = Boolean(user && !user.must_change_password);
  const [searchParams, setSearchParams] = useSearchParams();
  const entityType = ENTITY_OF_TAB[searchParams.get("tab")] || "kpi";
  const tab = TABS.find((item) => item.entityType === entityType);

  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [linesByEntity, setLinesByEntity] = useState({ kpi: [], target_allocation: [] });
  // Rows of the database (signed-in users); null until loaded.
  const [recordsByEntity, setRecordsByEntity] = useState({ kpi: null, target_allocation: null });
  const recordsRef = useRef(recordsByEntity);
  const [recordsError, setRecordsError] = useState("");
  const [chosenView, setChosenView] = useState(null);
  const [reviewed, setReviewed] = useState({ key: "", lines: [], loading: false });
  const [chosenSubmittedBy, setChosenSubmittedBy] = useState(readStoredPerson);
  const [onlyMine, setOnlyMine] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  // Filters of the grids: column key -> { value, label } (GRID_FILTERS).
  const [gridFilters, setGridFilters] = useState({});
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  // Bumped by Reload: the submitted and rejected lines are read again.
  const [reviewedVersion, setReviewedVersion] = useState(0);
  const [notice, setNotice] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [lineToDelete, setLineToDelete] = useState(null);

  // "all": the rows of the database and the new lines (signed-in users);
  // "open": the lines waiting for review; "reviewed": submitted and rejected.
  const view = chosenView === "all" && !canSeeRecords ? "open" : chosenView || (canSeeRecords ? "all" : "open");

  // Signed-in users are "Submitted by" themselves, unless they pick someone.
  const submittedBy = useMemo(() => {
    if (chosenSubmittedBy !== undefined) return chosenSubmittedBy;
    if (!user?.people_id) return null;
    return { id: user.people_id, label: user.email ? `${user.full_name} — ${user.email}` : user.full_name };
  }, [chosenSubmittedBy, user]);

  const columns = useMemo(() => lookups?.columns?.[entityType] || [], [lookups, entityType]);
  const infoColumns = canSeeRecords ? lookups?.record_info_columns?.[entityType] || [] : [];
  const lines = linesByEntity[entityType];
  const records = recordsByEntity[entityType];
  const recordsById = useMemo(() => new Map((records || []).map((record) => [record.record_id, record])), [records]);

  const updateLines = useCallback(
    (type, updater) => setLinesByEntity((current) => ({ ...current, [type]: updater(current[type]) })),
    []
  );

  // Lists and waiting lines of both grids; lines being edited are kept, and put
  // on the rows of the database as they are now. records: "load" them again,
  // "clear" them (signed out), or "keep" those loaded (the database only
  // changes when an administrator submits). The rows failing to load does not
  // stop the rest of the page; it is returned as recordsFailed.
  const refresh = useCallback(async ({ records: recordsMode = "keep" } = {}) => {
    const loadingRecords =
      recordsMode === "load"
        ? Promise.all([fetchRecords("kpi"), fetchRecords("target_allocation")]).then(
          ([kpi, targetAllocation]) => ({ kpi, target_allocation: targetAllocation }),
          (error) => {
            setRecordsError(getApiErrorMessage(error, "Unable to load the KPIs of the database."));
            return null;
          }
        )
        : null;
    const [lookupData, kpiLines, allocationLines, loadedRecords] = await Promise.all([
      apiClient.get("/api/kpi-intake/lookups").then((res) => res.data),
      fetchLines("kpi"),
      fetchLines("target_allocation"),
      loadingRecords,
    ]);
    const nextRecords =
      recordsMode === "clear" ? { kpi: null, target_allocation: null } : loadedRecords || recordsRef.current;
    if (loadedRecords) setRecordsError("");
    recordsRef.current = nextRecords;
    setLookups(lookupData);
    setRecordsByEntity(nextRecords);
    setLinesByEntity((current) => ({
      kpi: attachRecords(mergeServerLines(current.kpi, kpiLines), nextRecords.kpi, lookupData.columns.kpi),
      target_allocation: attachRecords(
        mergeServerLines(current.target_allocation, allocationLines),
        nextRecords.target_allocation,
        lookupData.columns.target_allocation
      ),
    }));
    return { recordsFailed: recordsMode === "load" && !loadedRecords };
  }, []);
  const recordsMode = canSeeRecords ? "load" : "clear";

  // Once the session is known, and again when it changes (rows of the database).
  useEffect(() => {
    if (authStatus === "loading") return undefined;
    let cancelled = false;
    (async () => {
      try {
        await refresh({ records: recordsMode });
      } catch (error) {
        if (!cancelled) setLoadError(getApiErrorMessage(error, "Unable to load the page."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, recordsMode, refresh]);

  // Always one line to type in.
  useEffect(() => {
    if (!lookups || view !== "open" || lines.length) return;
    updateLines(entityType, (current) => (current.length ? current : [newLine(columns)]));
  }, [columns, entityType, lines.length, lookups, updateLines, view]);

  // Submitted and rejected lines, read only.
  const reviewedKey = `${entityType}|${view}|${canSeeRecords}|${reviewedVersion}`;
  useEffect(() => {
    if (view !== "reviewed") return undefined;
    let cancelled = false;
    setReviewed({ key: reviewedKey, lines: [], loading: true });
    fetchLines(entityType, "reviewed")
      .then((serverLines) => {
        if (!cancelled) setReviewed({ key: reviewedKey, lines: serverLines.map(fromServerLine), loading: false });
      })
      .catch(() => {
        if (!cancelled) setReviewed({ key: reviewedKey, lines: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, reviewedKey, view]);

  const unsavedCount = useMemo(() => {
    if (!lookups) return 0;
    return ENTITY_TYPES.reduce((total, type) => total + linesToSave(linesByEntity[type], lookups.columns[type]).length, 0);
  }, [linesByEntity, lookups]);

  useEffect(() => {
    if (!unsavedCount) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedCount]);

  const referenceOptions = useCallback(
    (column) => {
      if (!lookups || column.type !== "ref") return [];
      const references = lookups.references[column.ref] || [];
      return column.allowIntake ? [...(lookups.intake_kpis || []), ...references] : references;
    },
    [lookups]
  );
  const searchFor = useCallback((column) => SEARCHES[column.ref] || null, []);

  // Every row of the database (with its change, if any), after the new lines.
  const allLines = useMemo(() => {
    if (!records) return lines;
    const changeOf = new Map(lines.filter((line) => line.record_id).map((line) => [line.record_id, line]));
    return [
      ...lines.filter((line) => !line.record_id || !recordsById.has(line.record_id)),
      ...records
        .filter((record) => showInactive || record.active || changeOf.has(record.record_id))
        .map((record) => changeOf.get(record.record_id) || recordLine(record)),
    ];
  }, [lines, records, recordsById, showInactive]);

  const inactiveCount = useMemo(() => (records || []).filter((record) => !record.active).length, [records]);

  // The lines of the view, before the search and the filters.
  const viewLines = useMemo(() => {
    if (view === "reviewed") return reviewed.key === reviewedKey ? reviewed.lines : [];
    if (view === "all") return allLines;
    // Waiting lines, and this page's unsaved ones.
    const result = lines.filter((line) => line.intake_id || !line.record_id || isLineDirty(line, columns));
    if (!onlyMine || !submittedBy?.id) return result;
    return result.filter((line) => !line.intake_id || line.submitted_by?.id === submittedBy.id);
  }, [allLines, columns, lines, onlyMine, reviewed, reviewedKey, submittedBy, view]);

  // Search, then the filters of the grid. Each filter offers the values of the
  // lines the others keep, with how many lines have each. A new line being
  // typed is always shown (an added line never disappears behind a filter).
  const filterColumns = GRID_FILTERS[entityType] || NO_FILTERS;
  const { filteredLines, filterMenus } = useMemo(() => {
    const beingTyped = (line) => !line.intake_id && !line.record_id;
    const term = normalizeText(search);
    const searched = term
      ? viewLines.filter((line) => beingTyped(line) || searchText(line, recordsById.get(line.record_id)).includes(term))
      : viewLines;
    const active = filterColumns.filter((filter) => gridFilters[filter.key]);
    const keeps = (line, except = null) =>
      active.every(
        (filter) => filter.key === except || filterValueOf(line.values?.[filter.key]) === gridFilters[filter.key].value
      );

    const menus = filterColumns.map((filter) => {
      const found = new Map();
      let total = 0;
      for (const line of searched) {
        if (beingTyped(line) || !keeps(line, filter.key)) continue;
        total += 1;
        const value = filterValueOf(line.values?.[filter.key]);
        const entry = found.get(value) || {
          value,
          label: value === NO_VALUE ? filter.none : cellText(line.values[filter.key]),
          count: 0,
        };
        entry.count += 1;
        found.set(value, entry);
      }
      const selected = gridFilters[filter.key];
      if (selected && !found.has(selected.value)) found.set(selected.value, { ...selected, count: 0 });
      const entries = [...found.values()].sort(
        (left, right) => (left.value === NO_VALUE) - (right.value === NO_VALUE) || left.label.localeCompare(right.label)
      );
      return {
        ...filter,
        options: [
          { value: "", label: filter.all, description: String(total) },
          ...entries.map((entry) => ({ value: entry.value, label: entry.label, description: String(entry.count) })),
        ],
      };
    });
    return { filteredLines: searched.filter((line) => beingTyped(line) || keeps(line)), filterMenus: menus };
  }, [filterColumns, gridFilters, recordsById, search, viewLines]);
  const activeFilterCount = filterColumns.filter((filter) => gridFilters[filter.key]).length;

  const visibleLines = useMemo(() => filteredLines.slice(0, visibleCount), [filteredLines, visibleCount]);
  const remaining = filteredLines.length - visibleLines.length;

  const counts = useMemo(() => {
    const result = { ready: 0, duplicate: 0, error: 0 };
    for (const type of ENTITY_TYPES) {
      for (const line of linesByEntity[type]) {
        if (!line.intake_id) continue;
        if (line.status === "pending") result.ready += 1;
        else if (result[line.status] !== undefined) result[line.status] += 1;
      }
    }
    return result;
  }, [linesByEntity]);

  // A row of the database becomes a line of this page when someone edits it.
  const lineFor = (current, key) => {
    if (current.some((line) => line.key === key)) return current;
    const record = recordsById.get(Number(String(key).replace(/^record-/, "")));
    return record ? [...current, recordLine(record)] : current;
  };

  const changeCell = (key, columnKey, value) =>
    updateLines(entityType, (current) =>
      lineFor(current, key).map((line) =>
        line.key === key
          ? { ...line, values: { ...line.values, [columnKey]: value }, errors: { ...line.errors, [columnKey]: undefined } }
          : line
      )
    );

  const showFromStart = () => setVisibleCount(PAGE_SIZE);

  const addLine = () => {
    updateLines(entityType, (current) => [...current, newLine(columns)]);
    if (view === "all") showFromStart();
  };

  const duplicateLine = (line) => {
    updateLines(entityType, (current) => {
      const index = current.findIndex((item) => item.key === line.key);
      const copy = newLine(columns, { ...line.values });
      return index < 0 ? [...current, copy] : [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    });
    if (line.record_id) {
      setNotice({
        tone: "info",
        text: `A copy of ${RECORD_NOUN[entityType]} #${line.record_id} was added as a new line${
          view === "all" ? ", above the rows of the database" : ""
        }.`,
      });
    }
  };

  const removeLine = (line) => {
    if (line.intake_id) setLineToDelete(line);
    // An unsaved change of a row: the row is shown as it is in the database again.
    else updateLines(entityType, (current) => current.filter((item) => item.key !== line.key));
  };

  const deleteSavedLine = async () => {
    const line = lineToDelete;
    try {
      await apiClient.delete(`/api/kpi-intake/lines/${line.intake_id}`);
      updateLines(entityType, (current) => current.filter((item) => item.key !== line.key));
      setNotice({
        tone: "success",
        text: line.record_id
          ? `The change of ${RECORD_NOUN[entityType]} #${line.record_id} was dropped.`
          : `Line #${line.intake_id} deleted.`,
      });
      await refresh();
    } catch (error) {
      setNotice({ tone: "error", text: getApiErrorMessage(error, "The line could not be deleted.") });
    } finally {
      setLineToDelete(null);
    }
  };

  // Cells copied from Excel, pasted into a cell: filled from there, lines added as needed.
  const pasteCells = (rowIndex, colIndex, rows) =>
    updateLines(entityType, (current) => {
      let next = [...current];
      rows.forEach((cells, offset) => {
        const target = visibleLines[rowIndex + offset];
        if (target) next = lineFor(next, target.key);
        let index = target ? next.findIndex((line) => line.key === target.key) : -1;
        if (index < 0) {
          next.push(newLine(columns));
          index = next.length - 1;
        }
        const values = { ...next[index].values };
        cells.forEach((cell, cellOffset) => {
          const column = columns[colIndex + cellOffset];
          if (column) values[column.key] = coerceCell(column, cell, referenceOptions(column));
        });
        next[index] = { ...next[index], values };
      });
      return next;
    });

  const addPastedLines = (pastedValues) =>
    updateLines(entityType, (current) => [
      ...current.filter((line) => line.intake_id || line.record_id || !isLineEmpty(line, columns)),
      ...pastedValues.map((values) => newLine(columns, { ...defaultValues(columns), ...values })),
    ]);

  const save = async () => {
    const toSend = linesToSave(lines, columns);
    if (!toSend.length) {
      setNotice({ tone: "info", text: "Nothing new to save on this tab." });
      return;
    }
    if (!submittedBy?.id) {
      setNotice({ tone: "error", text: 'Pick your name in "Submitted by" before saving.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiClient.post("/api/kpi-intake/lines", {
        entity_type: entityType,
        submitted_by: submittedBy,
        lines: toSend.map((line) => ({
          intake_id: line.intake_id,
          row_version: line.row_version,
          record_id: line.record_id || undefined,
          base: line.record_id ? line.base : undefined,
          values: line.values,
        })),
      });
      const sentKeys = new Set(toSend.map((line) => line.key));
      updateLines(entityType, (current) =>
        attachRecords(
          mergeServerLines(
            current.filter(
              (line) => !sentKeys.has(line.key) && (line.intake_id || line.record_id || !isLineEmpty(line, columns))
            ),
            res.data.lines
          ),
          recordsRef.current[entityType],
          columns
        )
      );
      const savedIds = new Set(res.data.saved_ids);
      const dropped = (res.data.discarded_ids || []).length;
      const saved = res.data.lines.filter((line) => savedIds.has(line.intake_id));
      const toFix = saved.filter((line) => line.status === "error").length;
      const duplicates = saved.filter((line) => line.status === "duplicate").length;
      setNotice({
        tone: toFix || duplicates ? "warning" : "success",
        text: [
          savedIds.size ? `${plural(savedIds.size, "line")} saved.` : "",
          dropped ? `${plural(dropped, "change")} dropped: back to the database values.` : "",
          toFix ? `${toFix} to fix — see the red cells.` : "",
          duplicates ? `${plural(duplicates, "duplicate")} — they will not be submitted.` : "",
          savedIds.size && !toFix && !duplicates ? "An administrator will review them." : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
      // The other grid may depend on these lines (allocations of new KPIs).
      await refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text: getApiErrorMessage(error, "The lines could not be saved."),
        reload: error.response?.status === 409,
      });
    } finally {
      setSaving(false);
    }
  };

  // After a conflict: the server's version of every line and row, this page's edits dropped.
  const reloadDiscarding = async () => {
    setNotice(null);
    setReloading(true);
    try {
      const [kpiLines, allocationLines] = await Promise.all([fetchLines("kpi"), fetchLines("target_allocation")]);
      setLinesByEntity((current) => ({
        kpi: [...kpiLines.map(fromServerLine), ...current.kpi.filter((line) => !line.intake_id && !line.record_id)],
        target_allocation: [
          ...allocationLines.map(fromServerLine),
          ...current.target_allocation.filter((line) => !line.intake_id && !line.record_id),
        ],
      }));
      await refresh({ records: recordsMode });
    } catch (error) {
      setNotice({ tone: "error", text: getApiErrorMessage(error, "Unable to reload the lines.") });
    } finally {
      setReloading(false);
    }
  };

  // Everything read again; Save waits meanwhile (an older answer arriving after
  // a save would drop the lines just saved). Unsaved edits are kept.
  const reload = async () => {
    if (reloading) return;
    setNotice(null);
    setReloading(true);
    if (view === "reviewed") setReviewedVersion((version) => version + 1);
    try {
      const { recordsFailed } = await refresh({ records: recordsMode });
      if (!recordsFailed) {
        setNotice({
          tone: "success",
          text: `Reloaded: the lines and the database as they are now.${unsavedCount ? " Your unsaved edits are kept." : ""}`,
        });
      }
    } catch (error) {
      setNotice({ tone: "error", text: getApiErrorMessage(error, "Unable to reload the page.") });
    } finally {
      setReloading(false);
    }
  };

  const chooseTab = (type) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.set("tab", TAB_OF_ENTITY[type]);
        return next;
      },
      { replace: true }
    );
    showFromStart();
  };

  const chooseView = (value) => {
    setChosenView(value);
    showFromStart();
  };

  // value "" = every line; the label is kept to name a value no line has any more.
  const changeFilter = (menu, value) => {
    const label = menu.options.find((option) => option.value === value)?.label || "";
    setGridFilters((current) => {
      const next = { ...current };
      if (value) next[menu.key] = { value, label };
      else delete next[menu.key];
      return next;
    });
    showFromStart();
  };

  const clearFilters = () => {
    setGridFilters((current) => {
      const next = { ...current };
      for (const filter of filterColumns) delete next[filter.key];
      return next;
    });
    showFromStart();
  };

  // A person picked in the list ({ id, label }), or the text being typed.
  const chooseSubmittedBy = (value) => {
    setChosenSubmittedBy(value || null);
    storePerson(value && typeof value === "object" && value.id ? value : null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Spinner /> Loading…
      </div>
    );
  }

  if (loadError || !lookups) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <AlertIcon size={28} className="mx-auto text-red-500 dark:text-red-400" />
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{loadError || "Unable to load the page."}</p>
        <button type="button" className={`${buttonClasses.secondary} mt-5`} onClick={() => window.location.reload()}>
          <RefreshIcon size={16} /> Try again
        </button>
      </div>
    );
  }

  const readOnly = view === "reviewed";
  const tabCounts = Object.fromEntries(
    ENTITY_TYPES.map((type) => [type, linesByEntity[type].filter((line) => line.intake_id).length])
  );
  const tabUnsaved = Object.fromEntries(
    ENTITY_TYPES.map((type) => [type, linesToSave(linesByEntity[type], lookups.columns[type]).length])
  );
  const views = [
    ...(canSeeRecords ? [["all", `All ${tab.plural}`, records ? records.length - (showInactive ? 0 : inactiveCount) : null]] : []),
    ["open", "Waiting for review", tabCounts[entityType]],
    ["reviewed", "Submitted & rejected", null],
  ];

  return (
    <div className={`mx-auto max-w-[1700px] px-4 pt-6 sm:px-6 ${isAdmin ? "pb-28" : "pb-12"}`}>
      <header className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-blue-50 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900 dark:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5 p-6">
          <BoardTitle
            className="flex-1 basis-[26rem]"
            icon={ClipboardIcon}
            eyebrow="KPI tables"
            title="KPI & Target Intake"
            subtitle={
              canSeeRecords
                ? "Every KPI and target allocation of the database, ready to change — and room for new ones."
                : "Propose new KPIs and target allocations for the KPI tables."
            }
          />

          {/* Who the lines are saved under: the one thing to fill before saving. */}
          <div className="w-full sm:w-[380px]">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Submitted by <span className="text-red-500 dark:text-red-400">*</span>
            </p>
            <ReferenceInput
              className="mt-2 w-full"
              value={submittedBy}
              onChange={chooseSubmittedBy}
              search={SEARCHES.people}
              placeholder="Search your name or e-mail…"
              ariaLabel="Submitted by"
              invalid={notice?.tone === "error" && !submittedBy?.id}
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Your lines are saved under this name.</p>
            {/* Signed in: the way back to the dashboard and the role are in the page header (MainLayout). */}
            {authStatus !== "loading" && !user ? (
              <Link
                to={`/login?next=${encodeURIComponent("/kpi-intake")}`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                <LoginIcon size={15} /> Sign in to see and change the existing KPIs
              </Link>
            ) : null}
          </div>
        </div>

        {/* How a line goes from this page to the KPI tables: a numbered strip. */}
        <ol className="grid border-t border-slate-200/80 sm:grid-cols-3 dark:border-slate-800">
          {intakeSteps({ canSeeRecords, isAdmin }).map((item, index) => (
            <li
              key={item.title}
              className="flex gap-3 border-slate-200/80 px-6 py-4 max-sm:[&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-l dark:border-slate-800"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-sm shadow-blue-600/30 dark:shadow-none">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-white">{item.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </header>

      {/* The two tables, as underline tabs; the count is the lines waiting for review. */}
      <nav className="mt-8 flex flex-wrap items-end gap-6 border-b border-slate-200 dark:border-slate-800" aria-label="Tables">
        {TABS.map(({ entityType: type, label, icon: Icon }) => {
          const active = type === entityType;
          return (
            <button
              key={type}
              type="button"
              onClick={() => chooseTab(type)}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-[15px] font-bold transition ${
                active
                  ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white"
              }`}
            >
              <Icon size={17} />
              {label}
              <span
                className={`min-w-6 rounded-full px-2 py-0.5 text-center text-[11px] ${
                  active ? "bg-blue-600 text-white" : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }`}
                title="Lines waiting for review"
              >
                {tabCounts[type]}
              </span>
              {tabUnsaved[type] ? <span className="h-2 w-2 rounded-full bg-amber-400" title="Unsaved lines" /> : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-200/60 p-1 text-sm font-semibold dark:bg-slate-800">
          {views.map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => chooseView(value)}
              aria-pressed={view === value}
              className={`rounded-lg px-3.5 py-1.5 transition ${
                view === value
                  ? "bg-white text-blue-700 shadow-sm dark:bg-blue-600 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {label}
              {count !== null ? (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-px text-[11px] font-bold ${
                    view === value
                      ? "bg-blue-50 text-blue-700 dark:bg-white/20 dark:text-white"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!readOnly ? (
            <>
              <button type="button" className={buttonClasses.secondary} onClick={addLine} disabled={saving}>
                <PlusIcon size={16} /> Add line
              </button>
              <button type="button" className={buttonClasses.secondary} onClick={() => setPasteOpen(true)} disabled={saving}>
                <ClipboardIcon size={16} /> Paste from Excel
              </button>
              <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:block dark:bg-slate-700" aria-hidden="true" />
            </>
          ) : null}
          <button
            type="button"
            className={buttonClasses.secondary}
            onClick={reload}
            disabled={saving || reloading}
            aria-busy={reloading}
            title="Reload the lines and the database (your unsaved edits are kept)"
          >
            {reloading ? <Spinner /> : <RefreshIcon size={16} />}
            <span className="sr-only sm:not-sr-only">{reloading ? "Reloading…" : "Reload"}</span>
          </button>
          {!readOnly ? (
            <button
              type="button"
              className={buttonClasses.primary}
              onClick={save}
              disabled={saving || reloading || !tabUnsaved[entityType]}
            >
              {saving ? <Spinner /> : <SaveIcon size={16} />}
              Save{tabUnsaved[entityType] ? ` ${plural(tabUnsaved[entityType], "line")}` : ""}
            </button>
          ) : null}
        </div>
      </div>

      {/* Finding lines: search, the filters of the grid, what to include. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-auto">
          <span className="sr-only">Search the lines</span>
          <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              showFromStart();
            }}
            placeholder={`Search ${tab.plural}…`}
            className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 text-sm shadow-sm outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/15 sm:w-64"
          />
        </label>
        {filterMenus.map((menu) => (
          <SelectMenu
            key={menu.key}
            icon={menu.icon}
            label={menu.label}
            value={gridFilters[menu.key]?.value || ""}
            options={menu.options}
            onChange={(value) => changeFilter(menu, value)}
            active={Boolean(gridFilters[menu.key])}
            searchable={menu.options.length > 8}
            searchPlaceholder={`Search a ${menu.label.toLowerCase()}...`}
            menuWidth={300}
            className="w-full sm:w-auto sm:max-w-xs"
          />
        ))}
        {activeFilterCount ? (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-blue-600 dark:text-blue-400 transition hover:bg-white dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40"
          >
            <CloseIcon size={14} /> Clear filters
          </button>
        ) : null}
        {view === "open" ? (
          <label className="ml-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-blue-600"
              checked={onlyMine}
              disabled={!submittedBy?.id}
              onChange={(event) => setOnlyMine(event.target.checked)}
            />
            Only my lines
          </label>
        ) : null}
        {view === "all" && inactiveCount ? (
          <label className="ml-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-blue-600"
              checked={showInactive}
              onChange={(event) => {
                setShowInactive(event.target.checked);
                showFromStart();
              }}
            />
            Show inactive ({inactiveCount})
          </label>
        ) : null}
      </div>

      {notice ? (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-2.5 text-sm ${NOTICE_TONES[notice.tone]}`}
        >
          {notice.tone === "success" ? <CheckCircleIcon size={17} /> : <AlertIcon size={17} />}
          <span className="flex-1">{notice.text}</span>
          {notice.reload ? (
            <button type="button" onClick={reloadDiscarding} className="font-bold underline">
              Reload (drop my unsaved edits)
            </button>
          ) : null}
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      ) : null}

      {recordsError ? (
        <div role="alert" className={`mt-3 flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm ${NOTICE_TONES.error}`}>
          <AlertIcon size={17} />
          <span className="flex-1">{recordsError}</span>
          <button type="button" onClick={reload} className="font-bold underline">
            Try again
          </button>
        </div>
      ) : null}

      {/* How to read and fill the grid, as a legend. */}
      {!readOnly ? (
        <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400" aria-label="How to fill the grid">
          <li className="inline-flex items-center gap-1.5">
            <span className="text-sm font-bold text-red-500 dark:text-red-400">*</span> Required
          </li>
          <li className="inline-flex items-center gap-1.5" title="Hover a column title to see what it depends on">
            <span className="text-sm font-bold text-amber-500 dark:text-amber-400">*</span> Required depending on another column
          </li>
          <li className="inline-flex items-center gap-1.5">
            <CheckIcon size={14} className="text-emerald-600 dark:text-emerald-400" /> Picked in the list — a typed name is matched when you save
          </li>
          <li className="inline-flex items-center gap-1.5">
            <ClipboardIcon size={14} className="text-slate-400 dark:text-slate-500" /> Cells copied from Excel can be pasted straight into the grid
          </li>
          {canSeeRecords ? (
            <li className="inline-flex items-center gap-1.5">
              <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30">
                Blue cell
              </span>
              differs from the database (hover it for its value) — only those are checked and written
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-3">
        {(readOnly && reviewed.loading) || (view === "all" && !records && !recordsError) ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500 dark:text-slate-400">
            <Spinner /> Loading…
          </div>
        ) : !filteredLines.length ? (
          <p className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {search || activeFilterCount
              ? `No ${tab.noun} line matches ${[search ? `“${search}”` : "", activeFilterCount ? "the filters" : ""]
                .filter(Boolean)
                .join(" and ")}.`
              : readOnly
                ? `No ${tab.noun} line was submitted or rejected yet.`
                : `No ${tab.noun} line is waiting for review.`}
          </p>
        ) : (
          <>
            <IntakeGrid
              columns={columns}
              infoColumns={infoColumns}
              lines={visibleLines}
              records={recordsById}
              recordNoun={RECORD_NOUN[entityType]}
              readOnly={readOnly}
              disabled={saving}
              onChangeCell={changeCell}
              onDuplicate={duplicateLine}
              onRemove={removeLine}
              onPasteCells={pasteCells}
              referenceOptions={referenceOptions}
              searchFor={searchFor}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {plural(filteredLines.length, "line")}
                {remaining > 0
                  ? ` · showing the first ${visibleLines.length}${search || activeFilterCount ? "" : " — search or filter to find one"}`
                  : ""}
              </span>
              {remaining > 0 ? (
                <button
                  type="button"
                  className={buttonClasses.secondary}
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  Show {Math.min(PAGE_SIZE, remaining)} more · {remaining} left
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {!isAdmin ? (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Saved lines wait for an administrator, who submits them to the KPI tables or rejects them (see “Submitted &amp;
          rejected”).
        </p>
      ) : null}

      {isAdmin ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
              <ShieldIcon size={17} className="text-orange-700 dark:text-orange-300" /> Admin review
            </span>
            <span className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" aria-hidden="true" />
            {/* Where the lines of both tables stand before the submit. */}
            <ul className="flex flex-wrap items-center gap-2 text-sm font-semibold" aria-label="Lines of both tables">
              <li className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                {counts.ready} ready
              </li>
              <li className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 ring-1 ring-inset ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                {plural(counts.duplicate, "duplicate")}
              </li>
              <li className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-red-700 ring-1 ring-inset ring-red-600/15 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
                {counts.error} to fix
              </li>
            </ul>
            <span className="text-xs text-slate-400 dark:text-slate-500">both tables</span>
            <button
              type="button"
              className={`${buttonClasses.primary} ml-auto`}
              onClick={() => setReviewOpen(true)}
              disabled={!counts.ready && !counts.duplicate && !counts.error}
            >
              <SendIcon size={16} /> Review &amp; submit
            </button>
          </div>
        </div>
      ) : null}

      {pasteOpen ? (
        <PasteDialog
          title={tab.noun}
          columns={columns}
          optionsFor={referenceOptions}
          onAdd={addPastedLines}
          onClose={() => setPasteOpen(false)}
        />
      ) : null}

      {reviewOpen ? (
        <SubmitReviewDialog
          hasUnsavedLines={unsavedCount > 0}
          onClose={() => setReviewOpen(false)}
          // A submit changes the database: its rows are read again.
          onChanged={() => refresh({ records: recordsMode }).catch(() => {})}
        />
      ) : null}

      {lineToDelete ? (
        <ConfirmDialog
          icon={TrashIcon}
          title={
            lineToDelete.record_id
              ? `Drop the change of ${RECORD_NOUN[entityType]} #${lineToDelete.record_id}?`
              : `Delete line #${lineToDelete.intake_id}?`
          }
          description={
            lineToDelete.record_id
              ? "The change waiting for review is removed; the row stays as it is in the database."
              : "The line is removed from the waiting list. Nothing was written to the KPI tables yet."
          }
          confirmLabel={lineToDelete.record_id ? "Drop the change" : "Delete line"}
          onCancel={() => setLineToDelete(null)}
          onConfirm={deleteSavedLine}
        />
      ) : null}
    </div>
  );
}
