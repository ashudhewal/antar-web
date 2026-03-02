const DISCLAIMER_KEY = "antar.disclaimer.accepted";
const ONBOARDING_KEY = "antar.onboarding.seen";
const LANGUAGE_KEY = "antar.language.mode";
const DEVICE_KEY = "antar.device.id";

export const getDisclaimerAccepted = (): boolean =>
  typeof window !== "undefined" && localStorage.getItem(DISCLAIMER_KEY) === "1";

export const setDisclaimerAccepted = () => {
  if (typeof window !== "undefined") localStorage.setItem(DISCLAIMER_KEY, "1");
};

export const getOnboardingSeen = (): boolean =>
  typeof window !== "undefined" && localStorage.getItem(ONBOARDING_KEY) === "1";

export const setOnboardingSeen = () => {
  if (typeof window !== "undefined") localStorage.setItem(ONBOARDING_KEY, "1");
};

export const getLanguageMode = (): "hinglish" | "english" => {
  if (typeof window === "undefined") return "hinglish";
  const value = localStorage.getItem(LANGUAGE_KEY);
  return value === "english" ? "english" : "hinglish";
};

export const setLanguageMode = (mode: "hinglish" | "english") => {
  if (typeof window !== "undefined") localStorage.setItem(LANGUAGE_KEY, mode);
};

export const getStableDeviceId = (): string => {
  if (typeof window === "undefined") return "server";
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const generated = `web-${crypto.randomUUID()}`;
  localStorage.setItem(DEVICE_KEY, generated);
  return generated;
};
