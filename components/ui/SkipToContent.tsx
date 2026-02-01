import React from "react";
import { cn } from "@/lib/utils";

export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className={cn(
        "fixed top-4 left-4 z-[100] -translate-y-[200%] rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-transform focus:translate-y-0",
        "focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
      )}
    >
      Skip to content
    </a>
  );
}
