"use client";

/**
 * MoodBoard (P4-T09, TDD §14.3)
 *
 * Image strip rendering 6 themed inspiration images from Unsplash
 * with required photographer attributions.
 * Hidden silently if key is missing or request fails.
 */

import React, { useEffect, useState } from "react";
import { SparklesIcon } from "lucide-react";
import type { EventInput } from "@/lib/schema";

export type MoodBoardImage = {
  url: string;
  alt: string;
  credit: string;
  link: string;
};

export function MoodBoard({ input }: { input?: EventInput | null }) {
  const [images, setImages] = useState<MoodBoardImage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!input) return;

    const traditionFirst = input.culturalTraditions
      ? input.culturalTraditions.split(/[,.;]/)[0]?.trim()
      : "";
    const mainTheme = input.theme?.trim() || input.eventType;
    const query = [mainTheme, traditionFirst, "decor"].filter(Boolean).join(" ");

    let cancelled = false;

    fetch(`/api/moodboard?q=${encodeURIComponent(query)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: MoodBoardImage[]) => {
        if (!cancelled && Array.isArray(data)) {
          setImages(data);
        }
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [input]);

  if (loading || images.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4 border-t pt-6">
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
        <h3 className="text-base font-semibold">Mood Board & Visual Decor Inspiration</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {images.map((img, i) => (
          <div
            key={i}
            className="group relative flex flex-col overflow-hidden rounded-lg border bg-muted"
          >
            <div className="relative aspect-4/3 w-full overflow-hidden bg-neutral-100">
              {/* Using native img or Next Image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="p-1.5 text-[10px] text-muted-foreground truncate">
              Photo by{" "}
              <a
                href={img.link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline hover:text-foreground"
              >
                {img.credit}
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
