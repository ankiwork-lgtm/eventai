import { formatMoney } from "@/lib/format";
import type { Plan } from "@/lib/schema";

export function BudgetTable({
  budget,
  currency,
  totalBudget,
}: {
  budget: Plan["budget"] | undefined;
  currency: string;
  totalBudget: number;
}) {
  return (
    <section className="mb-10 break-inside-avoid">
      <h2 className="text-xl font-bold border-b border-neutral-300 pb-2 mb-4 text-neutral-900">
        1. Budget Allocation
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border border-neutral-200">
          <caption className="sr-only">Budget allocation by category</caption>
          <thead className="bg-neutral-100 text-neutral-700 uppercase text-xs">
            <tr>
              <th scope="col" className="p-2.5 border-b border-r border-neutral-200">Category</th>
              <th scope="col" className="p-2.5 border-b border-r border-neutral-200 text-right">Cost</th>
              <th scope="col" className="p-2.5 border-b border-r border-neutral-200 text-right">%</th>
              <th scope="col" className="p-2.5 border-b border-neutral-200">Guidance & Tips</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {budget?.map((item, idx) => (
              <tr key={`${item.category}-${idx}`} className="odd:bg-white even:bg-neutral-50/50">
                <td className="p-2.5 font-medium border-r border-neutral-200">{item.category}</td>
                <td className="p-2.5 text-right font-mono border-r border-neutral-200">
                  {formatMoney(item.estimatedCost, currency)}
                </td>
                <td className="p-2.5 text-right font-mono border-r border-neutral-200">{item.percent}%</td>
                <td className="p-2.5 text-neutral-600 text-xs">{item.tips}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-100 font-semibold border-t-2 border-neutral-300">
            <tr>
              <td className="p-2.5 border-r border-neutral-200">Total</td>
              <td className="p-2.5 text-right font-mono border-r border-neutral-200">
                {formatMoney(totalBudget, currency)}
              </td>
              <td className="p-2.5 text-right font-mono border-r border-neutral-200">100.0%</td>
              <td className="p-2.5"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
