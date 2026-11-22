import type { ReactNode } from "react";
import { AccountShell } from "@/lib/conta-ui/account-shell";

export default function ContaLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
