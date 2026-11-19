import { useSyncExternalStore } from "react";

/** Hash routes keep deep links working on static hosting such as GitHub Pages. */
export type Route =
  | { name: "welcome" }
  | { name: "owed" }
  | { name: "schedule" }
  | {
      name: "add";
      mode?: "scan" | "type" | "change";
      shiftId?: string;
      date?: string;
      versionId?: string;
    }
  | { name: "finding"; key: string }
  | { name: "version"; id: string }
  | { name: "law" }
  | { name: "settings" }
  | { name: "export" };

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function parseHash(hash: string): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  const [head, ...rest] = path.split("/");
  const tail = decodeURIComponent(rest.join("/"));
  switch (head) {
    case "welcome":
      return { name: "welcome" };
    case "schedule":
      return { name: "schedule" };
    case "add": {
      const mode = rest[0];
      const route: Route = { name: "add" };
      if (mode === "scan" || mode === "type" || mode === "change") route.mode = mode;
      const shiftId = params.get("shift");
      const date = params.get("date");
      const versionId = params.get("version");
      if (shiftId) route.shiftId = shiftId;
      if (date) route.date = date;
      if (versionId) route.versionId = versionId;
      return route;
    }
    case "finding":
      return { name: "finding", key: tail };
    case "version":
      return { name: "version", id: tail };
    case "law":
      return { name: "law" };
    case "settings":
      return { name: "settings" };
    case "export":
      return { name: "export" };
    default:
      return { name: "owed" };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case "add": {
      const q = new URLSearchParams();
      if (route.shiftId) q.set("shift", route.shiftId);
      if (route.date) q.set("date", route.date);
      if (route.versionId) q.set("version", route.versionId);
      const qs = q.toString();
      return `#/add${route.mode ? `/${route.mode}` : ""}${qs ? `?${qs}` : ""}`;
    }
    case "finding":
      return `#/finding/${encodeURIComponent(route.key)}`;
    case "version":
      return `#/version/${encodeURIComponent(route.id)}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route, opts: { replace?: boolean } = {}): void {
  const target = href(route);
  if (opts.replace) {
    history.replaceState(null, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target.slice(1);
  }
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  return parseHash(hash);
}
