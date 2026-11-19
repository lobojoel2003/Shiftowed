import { useEffect } from "react";
import { useToast } from "./components/Toast";
import { useT } from "./i18n";
import { setupPwa } from "./lib/pwa";
import { navigate, useRoute } from "./lib/router";
import { useStore } from "./lib/store";
import { Add } from "./screens/Add";
import { Export } from "./screens/Export";
import { FindingDetail } from "./screens/FindingDetail";
import { Law } from "./screens/Law";
import { Owed } from "./screens/Owed";
import { Schedule } from "./screens/Schedule";
import { Settings } from "./screens/Settings";
import { VersionDetail } from "./screens/VersionDetail";
import { Welcome } from "./screens/Welcome";

export function App() {
  const { ready, data, jurisdiction } = useStore();
  const route = useRoute();
  const { t, locale } = useT();
  const toast = useToast();
  const onboarded = Boolean(data.profile?.onboarded && jurisdiction);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    setupPwa({
      onNeedRefresh: (reload) =>
        toast.show(t("pwa.update"), { label: t("pwa.reload"), run: reload }, 0),
    });
    // Register once; translations at that moment are fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!onboarded && route.name !== "welcome") navigate({ name: "welcome" }, { replace: true });
  }, [ready, onboarded, route.name]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name]);

  if (!ready) {
    return (
      <div className="app" aria-busy="true">
        <main className="content no-tabs">
          <p className="faint" style={{ textAlign: "center", marginTop: "40vh" }}>
            {t("common.loading")}
          </p>
        </main>
      </div>
    );
  }

  let screen;
  if (!onboarded || route.name === "welcome") {
    screen = <Welcome />;
  } else {
    switch (route.name) {
      case "schedule":
        screen = <Schedule />;
        break;
      case "add":
        screen = <Add route={route} />;
        break;
      case "finding":
        screen = <FindingDetail findingKey={route.key} />;
        break;
      case "version":
        screen = <VersionDetail id={route.id} />;
        break;
      case "law":
        screen = <Law />;
        break;
      case "settings":
        screen = <Settings />;
        break;
      case "export":
        screen = <Export />;
        break;
      default:
        screen = <Owed />;
    }
  }

  return <div className="app">{screen}</div>;
}
