"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./painel.module.css";

const ITEMS = [
  { href: "/painel", label: "Rota de sábado", manage: false },
  { href: "/painel/atrasos", label: "Atrasos", manage: true },
  { href: "/painel/reservas", label: "Reservas", manage: true },
  { href: "/painel/sabados", label: "Sábados", manage: true },
];

export function PainelNav({ manage }: { manage: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Painel" className={styles.nav}>
      {ITEMS.filter((i) => manage || !i.manage).map((i) => (
        <Link key={i.href} href={i.href} className={styles.navLink} aria-current={pathname === i.href ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
