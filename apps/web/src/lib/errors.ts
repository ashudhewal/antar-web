export const apiFriendlyError = (status: number, code: string, message: string, fallback: string): string => {
  const normalizedCode = (code || "").toUpperCase();
  const normalizedMessage = (message || "").toLowerCase();

  if (normalizedCode === "UNAUTHORIZED") {
    return normalizedMessage.includes("bearer token") ? "Session expired. Please sign in again." : "Authentication required. Please sign in again.";
  }
  if (normalizedCode === "FORBIDDEN") {
    if (normalizedMessage.includes("trial")) return "Free trial exhausted. Upgrade to continue.";
    if (normalizedMessage.includes("daily limit")) return "Daily limit reached. Please come back tomorrow.";
    if (normalizedMessage.includes("active call")) return "An active call already exists. End it, then retry.";
    return message || "Action is not allowed right now.";
  }
  if (normalizedCode === "TOO_MANY_REQUESTS") return message || "Too many requests. Please wait and retry.";
  if (normalizedCode === "OPENAI_NOT_CONFIGURED") return "Voice service is not configured on backend.";
  if (normalizedCode === "RAZORPAY_NOT_CONFIGURED") return "Payments are not configured on backend.";
  if (normalizedCode === "INTERNAL_ERROR") return "Server is temporarily unavailable. Please retry shortly.";
  if (status >= 500) return "Server is temporarily unavailable. Please retry shortly.";
  return message || fallback;
};
