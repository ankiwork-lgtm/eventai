import type { Plan } from "@/lib/schema";

export function IdeasList({ ideas }: { ideas: Plan["ideas"] | undefined }) {
  if (!ideas || ideas.length === 0) return null;
  return (
    <section className="mb-8 break-inside-avoid">
      <h2 className="text-xl font-bold border-b border-neutral-300 pb-2 mb-4 text-neutral-900">
        4. Creative Themes & Recommendations
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ideas.map((idea, idx) => (
          <div
            key={`${idea.title}-${idx}`}
            className="rounded border border-neutral-200 p-3.5 bg-white break-inside-avoid"
          >
            <h3 className="font-semibold text-sm text-neutral-900 mb-1">{idea.title}</h3>
            <p className="text-xs text-neutral-600 leading-relaxed">
              {idea.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
