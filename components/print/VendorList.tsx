import type { Plan } from "@/lib/schema";

export function VendorList({ vendors }: { vendors: Plan["vendors"] | undefined }) {
  return (
    <section className="mb-10 page-break-before break-inside-avoid">
      <h2 className="text-xl font-bold border-b border-neutral-300 pb-2 mb-4 text-neutral-900">
        3. Vendor Sourcing & Deliverables
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {vendors?.map((vendor, idx) => (
          <div
            key={`${vendor.type}-${idx}`}
            className="rounded border border-neutral-200 p-3.5 bg-neutral-50/50 break-inside-avoid"
          >
            <div className="flex items-start justify-between gap-2 mb-2 border-b border-neutral-200 pb-2">
              <h3 className="font-semibold text-neutral-900">{vendor.type}</h3>
              <span className="text-xs font-mono text-neutral-600 bg-white px-2 py-0.5 border rounded">
                {vendor.budgetRange}
              </span>
            </div>
            <ul className="space-y-1.5 text-xs text-neutral-700 mt-2">
              {vendor.checklist?.map((check, cIdx) => (
                <li key={`${check}-${cIdx}`} className="flex items-start gap-2">
                  <span
                    role="checkbox"
                    aria-checked="false"
                    aria-readonly="true"
                    aria-label={check}
                    className="inline-block size-3.5 border border-neutral-400 rounded-sm mt-0.5 shrink-0"
                  />
                  <span>{check}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
