import type { Citation as Cite } from "@shiftowed/rules";
import { ExternalLink } from "lucide-react";

export function Citation({ citation }: { citation: Cite }) {
  return (
    <a
      className="cite"
      href={citation.url}
      target="_blank"
      rel="noreferrer noopener"
      title={citation.quote}
    >
      {citation.code}
      <ExternalLink size={11} aria-hidden />
    </a>
  );
}
