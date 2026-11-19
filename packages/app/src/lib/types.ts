import type { ScheduleVersion } from "@shiftowed/rules";

export type Locale = "en" | "es";

export type PayPeriodKind = "weekly" | "biweekly" | "semimonthly" | "monthly";

export interface PayPeriodConfig {
  kind: PayPeriodKind;
  /** A date that starts a pay period (YYYY-MM-DD). Used for weekly and biweekly. */
  anchor: string;
}

export interface Profile {
  jurisdictionId: string;
  /** Regular hourly rate in dollars. */
  hourlyRate?: number;
  payPeriod: PayPeriodConfig;
  workerName?: string;
  employer?: string;
  workplace?: string;
  locale: Locale;
  onboarded: boolean;
  createdAt: string;
  /** True while the app holds demo data the user can clear. */
  demo?: boolean;
}

export type VersionSource = "manual" | "ocr" | "change" | "import" | "demo";

/** A schedule version as stored on the device, with evidence metadata. */
export interface StoredVersion extends ScheduleVersion {
  /** 1-based sequence number in capture order. */
  number: number;
  /** When the worker saved it in the app (ISO instant). */
  capturedAt: string;
  source: VersionSource;
  note?: string;
  /** Id of the screenshot in the images store. */
  imageId?: string;
  /** SHA-256 of the original screenshot bytes. */
  imageHash?: string;
  /** Raw OCR text, kept for the evidence log. */
  ocrText?: string;
  /** SHA-256 over this version's content and the previous hash. */
  hash: string;
  prevHash: string;
  editedAt?: string;
}

export interface StoredImage {
  id: string;
  blob: Blob;
  type: string;
  name?: string;
  createdAt: string;
}

export type AuditAction =
  | "version.created"
  | "version.edited"
  | "version.deleted"
  | "exception.set"
  | "exception.cleared"
  | "profile.updated"
  | "data.imported"
  | "data.cleared";

export interface AuditEvent {
  id: string;
  at: string;
  action: AuditAction;
  detail: string;
  versionId?: string;
}

export interface AppData {
  profile: Profile | null;
  versions: StoredVersion[];
  /** Exception id selected per finding key. */
  exceptions: Record<string, string>;
  audit: AuditEvent[];
}
