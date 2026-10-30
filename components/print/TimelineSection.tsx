import { formatDisplayDate, resolveTaskDate } from "@/lib/dates";
import type { TimelineGroup } from "@/lib/timeline";

const BADGE_BASE = "text-xs px-2 py-0.5 rounded uppercase font-semibold";

const PRIORITY_CLASS: Record<string, string> = {
  high: "bg-red-100 text-red-800 border border-red-200",
  medium: "bg-amber-100 text-amber-800 border border-amber-200",
};
const PRIORITY_FALLBACK = "bg-neutral-100 text-neutral-700 border border-neutral-200";

export function TimelineSection({
  groups,
  eventDate,
}: {
  groups: TimelineGroup[];
  eventDate: string;
}) {
  return (
    <section className="mb-10 page-break-before break-inside-avoid">
      <h2 className="text-xl font-bold border-b border-neutral-300 pb-2 mb-4 text-neutral-900">
        2. Master Timeline & Milestones
      </h2>
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.phase} className="break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-600 mb-2">
              {group.label}
            </h3>
            <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 text-sm">
              {group.items.map((item, idx) => {
                const resolved = resolveTaskDate(eventDate, item);
                return (
                  <li
                    key={`${item.task}-${item.when}-${idx}`}
                    className="flex items-start justify-between p-2.5 gap-4"
                  >
                    <div className="flex-1">
                      <span className="font-medium text-neutral-900">{item.task}</span>
                      <span className="ml-2 text-xs text-neutral-500">({item.when})</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {resolved && (
                        <span className="text-xs font-mono font-medium text-neutral-700">
                          {formatDisplayDate(resolved)}
                        </span>
                      )}
                      <span
                        className={`${BADGE_BASE} ${PRIORITY_CLASS[item.priority] ?? PRIORITY_FALLBACK}`}
                      >
                        {item.priority}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
