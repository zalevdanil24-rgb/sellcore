"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

// Разделы появятся по этапу 3; пока ссылки ведут на заглушки.
const items: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Обзор", icon: "home" },
  { href: "/ads", label: "РнП реклама", icon: "chart" },
  { href: "/supplies", label: "Поставки FBO", icon: "truck" },
  { href: "/tasks", label: "Задачи", icon: "tasks" },
  { href: "/products", label: "Товары", icon: "box" },
  { href: "/finance", label: "Финансы", icon: "wallet" },
  { href: "/team", label: "Сотрудники", icon: "users" },
  { href: "/settings", label: "Кабинеты", icon: "settings" },
];

// resetRequests — сколько сотрудников ждут ссылку для нового пароля (видит только владелец).
export function NavLinks({ resetRequests = 0 }: { resetRequests?: number }) {
  const path = usePathname();
  return (
    <>
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={`nav-item${active ? " active" : ""}`}>
            <Icon name={i.icon} />
            {i.label}
            {i.href === "/team" && resetRequests > 0 && (
              <span className="nav-badge" title="Запросы на восстановление пароля">{resetRequests}</span>
            )}
          </Link>
        );
      })}
    </>
  );
}
