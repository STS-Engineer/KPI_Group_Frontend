// Joins the API base URL and a path ("/api/..."). The base is "/" when the
// site and the API share one origin (kpi-codir), or a full URL such as
// "http://localhost:5001" in local development. A plain `${base}${path}`
// would give "//api/..." for "/", which the browser reads as another host.
export function joinApiUrl(baseURL, path) {
  const base = String(baseURL || "").replace(/\/+$/, "");
  return `${base}/${String(path).replace(/^\/+/, "")}`;
}
