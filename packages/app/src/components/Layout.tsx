import { CalendarDays, ChevronLeft, CircleDollarSign, Plus, Scale, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { href, type Route, useRoute } from "../lib/router";
import { useStore } from "../lib/store";

const logo = `${import.meta.env.BASE_URL}favicon.svg`;

export function TopBar({ back, title }: { back?: Route; title?: string }) {
  const { jurisdiction } = useStore();
  const { t } = useT();
  return (
    <header className="topbar">
      {back ? (
        <a className="back" href={href(back)} aria-label={t("common.back")}>
          <ChevronLeft size={20} aria-hidden />
        </a>
      ) : (
        <a className="brand" href={href({ name: "owed" })}>
          <img src={logo} alt="" width={32} height={32} />
          {t("app.name")}
        </a>
      )}
      {title && (
        <strong className="grow" style={{ fontSize: "1.02rem" }}>
          {title}
        </strong>
      )}
      {!title && <span className="spacer" />}
      {jurisdiction && !back && (
        <a className="chip-law" href={href({ name: "law" })} title={jurisdiction.name}>
          {jurisdiction.shortName}
        </a>
      )}
    </header>
  );
}

export function TabBar() {
  const route = useRoute();
  const { t } = useT();
  const current = (names: Route["name"][]) => (names.includes(route.name) ? "page" : undefined);
  return (
    <nav className="tabbar" aria-label="Main">
      <a
        className="tab"
        href={href({ name: "owed" })}
        aria-current={current(["owed", "finding", "export"])}
      >
        <CircleDollarSign size={22} aria-hidden />
        {t("nav.owed")}
      </a>
      <a
        className="tab"
        href={href({ name: "schedule" })}
        aria-current={current(["schedule", "version"])}
      >
        <CalendarDays size={22} aria-hidden />
        {t("nav.schedule")}
      </a>
      <div className="tab-add">
        <a href={href({ name: "add" })} aria-label={t("nav.add")} aria-current={current(["add"])}>
          <Plus size={28} strokeWidth={2.6} aria-hidden />
        </a>
      </div>
      <a className="tab" href={href({ name: "law" })} aria-current={current(["law"])}>
        <Scale size={22} aria-hidden />
        {t("nav.law")}
      </a>
      <a className="tab" href={href({ name: "settings" })} aria-current={current(["settings"])}>
        <Settings size={22} aria-hidden />
        {t("nav.settings")}
      </a>
    </nav>
  );
}

export function Page({
  children,
  back,
  title,
  tabs = true,
}: {
  children: ReactNode;
  back?: Route;
  title?: string;
  tabs?: boolean;
}) {
  return (
    <>
      <TopBar {...(back ? { back } : {})} {...(title ? { title } : {})} />
      <main className={`content${tabs ? "" : " no-tabs"}`} id="main">
        {children}
      </main>
      {tabs && <TabBar />}
    </>
  );
}
