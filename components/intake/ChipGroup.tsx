import { Badge } from "@/components/ui/badge";

function Chip({
  label,
  onAppend,
}: {
  label: string;
  onAppend: (text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onAppend(label)}
      aria-label={`Add ${label}`}
      className="inline-flex min-h-[40px] cursor-pointer items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <Badge variant="outline" className="cursor-pointer pointer-events-none" aria-hidden="true">
        + {label}
      </Badge>
    </button>
  );
}

/** A row of quick-add chips that append their label to a text field. */
export function ChipGroup({
  chips,
  onAppend,
}: {
  chips: string[];
  onAppend: (text: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {chips.map((chip) => (
        <Chip key={chip} label={chip} onAppend={onAppend} />
      ))}
    </div>
  );
}
