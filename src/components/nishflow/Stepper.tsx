import { Check } from "lucide-react";
import { STEPS, stepIndex } from "@/lib/nishflow";
import { cn } from "@/lib/utils";

export function Stepper({ status, liveUrl }: { status: string; liveUrl?: string | null }) {
  const current = stepIndex(status);
  const allDone = status === "Completed";
  return (
    <ol className="space-y-5">
      {STEPS.map((label, i) => {
        const done = i < current || allDone;
        const active = i === current && !allDone;
        return (
          <li key={label} className="flex gap-4">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                done && "border-success bg-success text-success-foreground",
                active && "border-amber text-amber animate-pulse",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <div className="pt-1">
              <p className={cn("font-medium", done && "text-success", active && "text-amber", !done && !active && "text-muted-foreground")}>{label}</p>
              {i === 3 && allDone && liveUrl && (
                <a href={liveUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-primary underline">
                  {liveUrl}
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
