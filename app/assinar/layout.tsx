import type { ReactNode } from "react";
import { Shell } from "@/lib/auth/ui";

export default function AssinarLayout({ children }: { children: ReactNode }) {
  return <Shell wide>{children}</Shell>;
}
