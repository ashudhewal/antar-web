"use client";

import { AuthProvider } from "@/contexts/auth";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
