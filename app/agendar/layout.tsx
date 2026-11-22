import type { ReactNode } from "react";
import { AccountShell } from "@/lib/conta-ui/account-shell";

export default function AgendarLayout({ children }: { children: ReactNode }) {
  return <AccountShell width="medium">{children}</AccountShell>;
}
