import {
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  Check,
  Clock4,
  Moon,
  MoveRight,
  Scissors,
} from "lucide-react";
import type { Finding } from "@shiftowed/rules";

export function FindingIcon({ finding, size = 21 }: { finding: Finding; size?: number }) {
  if (finding.status === "no-premium" || finding.status === "excepted")
    return <Check size={size} aria-hidden />;
  if (finding.type === "rest") return <Moon size={size} aria-hidden />;
  if (finding.type === "late-posting") return <CalendarClock size={size} aria-hidden />;
  switch (finding.change?.kind) {
    case "add":
      return <CalendarPlus size={size} aria-hidden />;
    case "extend":
      return <Clock4 size={size} aria-hidden />;
    case "move":
      return <MoveRight size={size} aria-hidden />;
    case "reduce":
      return <Scissors size={size} aria-hidden />;
    case "cancel":
      return <CalendarX2 size={size} aria-hidden />;
    default:
      return <CalendarClock size={size} aria-hidden />;
  }
}
