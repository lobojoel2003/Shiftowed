export interface BuildInfo {
  version: string;
  build: string;
  commit: string;
  date: string;
  channel: string;
}

declare const __BUILD_INFO__: BuildInfo;

export const BUILD: BuildInfo = __BUILD_INFO__;

/** e.g. "v1.0.0 (build 42, 1a2b3c4)" */
export function versionLabel(b: BuildInfo = BUILD): string {
  return `v${b.version} (build ${b.build}, ${b.commit})`;
}
