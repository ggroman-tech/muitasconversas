import type { ReactNode } from "react";
import { Shell } from "@/lib/auth/ui";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
