import axios from "axios";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/",
  // Sends the HttpOnly session cookie set by POST /api/auth/login.
  withCredentials: true,
});

// The AuthProvider registers itself here, so a request rejected because the
// session expired (or a password change is now required) updates the auth
// state and the route guards redirect -- wherever that request came from.
let authFailureHandler = null;

export function setAuthFailureHandler(handler) {
  authFailureHandler = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    const isAuthRoute = String(error.config?.url || "").startsWith("/api/auth/");
    if (authFailureHandler && !isAuthRoute) {
      if (status === 401 && code === "AUTH_REQUIRED") authFailureHandler("expired");
      if (status === 403 && code === "PASSWORD_CHANGE_REQUIRED") authFailureHandler("password-change");
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  return error?.response?.data?.error || (error?.response ? fallback : "Unable to reach the server.");
}

export default apiClient;
