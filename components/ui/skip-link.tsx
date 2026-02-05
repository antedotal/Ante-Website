import Link from "next/link";
import { cn } from "@/lib/utils";

export function SkipLink({ className }: { className?: string }) {
  return (
    <Link
      href="#main-content"
      className={cn(
        "fixed top-4 left-4 z-[100] -translate-y-[200%] rounded-md bg-white px-4 py-2 font-medium text-black shadow-md transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
        className
      )}
    >
      Skip to content
    </Link>
  );
}
