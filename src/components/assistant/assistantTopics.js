// What the AI Assistant panel suggests before the first question: questions
// about the page the user is on, about their own KPIs (signed in), and one
// entry per board of the app.

export const BOARD_TOPICS = [
  { label: "Consult KPI", question: "Explain the Consult KPI board: what it shows and how to create or edit a KPI." },
  { label: "My KPI Analytics", question: "How do I read the My KPI Analytics charts?" },
  { label: "Consult Target Allocation", question: "What is a target allocation, and how do I manage mine?" },
  { label: "Weekly KPI entry form", question: "How do I fill the weekly KPI entry form?" },
  { label: "Corrective actions", question: "When is a corrective action needed, and what should it contain?" },
  { label: "KPI & Target Intake", question: "How does the KPI & Target Intake page work?" },
  { label: "KPI Training Center", question: "How do the KPI trainings and tests work?" },
  { label: "KPI status rules", question: "How is a KPI judged on target or off target?" },
];

const MANAGER_ROLES = new Set(["plant_manager", "zone_manager", "vp", "ceo", "admin"]);

const PAGE_PROMPTS = [
  {
    match: (path, hash) => /^\/responsible\/[^/]+\/dashboard$/.test(path) && ["#my-kpis", "#analytics"].includes(hash),
    prompts: ["Which of my KPIs are getting worse?", "Compare my KPIs with their targets over the last 6 months"],
  },
  {
    match: (path, hash) => /^\/responsible\/[^/]+\/dashboard$/.test(path) && ["#consult-target-allocation", "#allocations"].includes(hash),
    prompts: ["List my active target allocations", "How do I create a target allocation?"],
  },
  {
    match: (path) => /^\/responsible\/[^/]+\/dashboard$/.test(path),
    prompts: ["Summarize my KPI performance this month", "How do I create a new KPI?"],
  },
  { match: (path) => path === "/form", prompts: ["How do I fill this form?", "What should I write as a root cause?"] },
  { match: (path) => path === "/kpi-intake", prompts: ["What goes in each of the two grids?", "Why is a cell flagged in red?"] },
  { match: (path) => path.startsWith("/corrective-action"), prompts: ["How do I close a corrective action?", "What makes a good corrective action?"] },
  { match: (path) => path.startsWith("/kpi-training"), prompts: ["How is the test scored?", "What happens if I miss the due date?"] },
  { match: (path) => path === "/admin/users", prompts: ["What can each account role see?", "How do I invite a new user?"] },
  { match: (path) => path === "/dashboard" || path === "/dashboard-history", prompts: ["How do I read this monthly dashboard?"] },
  { match: (path) => path === "/kpi-target-adjustments/review", prompts: ["How should I decide on this target proposal?"] },
];

export function getQuickPrompts({ user = null, path = "", hash = "" } = {}) {
  const normalizedPath = String(path).replace(/\/+$/, "") || "/";
  const normalizedHash = String(hash).toLowerCase();
  const page = PAGE_PROMPTS.find((entry) => entry.match(normalizedPath, normalizedHash));
  const signedIn = Boolean(user) && !user.must_change_password;

  const dataPrompts = [];
  if (signedIn && user.people_id) {
    dataPrompts.push("Which of my KPIs are off target right now?", "Show my open corrective actions");
  }
  if (signedIn && MANAGER_ROLES.has(user.role)) {
    dataPrompts.push(
      "Which responsibles in my scope have the most KPIs off target?",
      "Who has not entered KPI values in the last 2 weeks?"
    );
  }
  if (signedIn && user.people_id) dataPrompts.push("Do I have KPI trainings to complete?");

  return { pagePrompts: page ? page.prompts : [], dataPrompts: dataPrompts.slice(0, 4), topics: BOARD_TOPICS };
}

const SCOPE_PHRASES = {
  plant_manager: " and those of your plant",
  zone_manager: " and those of your zone",
  vp: " across every plant",
  ceo: " across every plant",
  admin: " across every plant",
};

export function getGreeting(user) {
  if (!user || user.must_change_password) {
    return "Hi! I'm your KPI assistant. I can explain every board of KPI Manager and what each KPI means. Sign in to ask about your own figures.";
  }
  const firstName = String(user.full_name || "").trim().split(/\s+/)[0];
  const scope = SCOPE_PHRASES[user.role] || "";
  return `Hi${firstName ? ` ${firstName}` : ""}! I'm your KPI assistant. I read your live KPIs${scope} — results, trends, targets, corrective actions — explain every board, and help you get back on target. What would you like to know?`;
}
