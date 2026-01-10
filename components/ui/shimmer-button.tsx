import React, { ComponentPropsWithoutRef, CSSProperties } from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button"> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  className?: string
  children?: React.ReactNode
  href?: string
  target?: string
  rel?: string
}

export const ShimmerButton = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ShimmerButtonProps
>(
  (
    {
      shimmerColor = "#ffffff",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "100px",
      background = "rgba(0, 0, 0, 1)",
      className,
      children,
      href,
      target,
      rel,
      ...props
    },
    ref
  ) => {
    // Shared style object for both button and anchor elements
    const sharedStyle = {
      "--spread": "90deg",
      "--shimmer-color": shimmerColor,
      "--radius": borderRadius,
      "--speed": shimmerDuration,
      "--cut": shimmerSize,
      "--bg": background,
    } as CSSProperties

    // Shared className for both button and anchor elements
    const sharedClassName = cn(
      "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden [border-radius:var(--radius)] border border-white/10 px-6 py-3 whitespace-nowrap text-white [background:var(--bg)]",
      "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
      className
    )

    // Shared content (spark effects, highlight, backdrop)
    const sharedContent = (
      <>
        {/* spark container */}
        <div
          className={cn(
            "-z-30 blur-[2px]",
            "[container-type:size] absolute inset-0 overflow-visible"
          )}
        >
          {/* spark */}
          <div className="animate-shimmer-slide absolute inset-0 [aspect-ratio:1] h-[100cqh] [border-radius:0] [mask:none]">
            {/* spark before */}
            <div className="animate-spin-around absolute -inset-full w-auto [translate:0_0] rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
          </div>
        </div>
        {children}

        {/* Highlight */}
        <div
          className={cn(
            "absolute inset-0 size-full",

            "rounded-2xl px-4 py-1.5 text-sm font-medium shadow-[inset_0_-8px_10px_#ffffff1f]",

            // transition
            "transform-gpu transition-all duration-300 ease-in-out",

            // on hover
            "group-hover:shadow-[inset_0_-6px_10px_#ffffff3f]",

            // on click
            "group-active:shadow-[inset_0_-10px_10px_#ffffff3f]"
          )}
        />

        {/* backdrop */}
        <div
          className={cn(
            "absolute [inset:var(--cut)] -z-20 [border-radius:var(--radius)] [background:var(--bg)]"
          )}
        />
      </>
    )

    // If href is provided, render as a link (using Next.js Link for internal routes)
    if (href) {
      // Check if it's an internal route (starts with /) or external URL
      const isInternalRoute = href.startsWith("/")

      if (isInternalRoute) {
        // Use Next.js Link for internal navigation
        return (
          <Link
            href={href}
            style={sharedStyle}
            className={sharedClassName}
            ref={ref as React.ForwardedRef<HTMLAnchorElement>}
            {...(target && { target })}
            {...(rel && { rel })}
          >
            {sharedContent}
          </Link>
        )
      } else {
        // Use anchor tag for external URLs
        return (
          <a
            href={href}
            style={sharedStyle}
            className={sharedClassName}
            ref={ref as React.ForwardedRef<HTMLAnchorElement>}
            target={target || "_blank"}
            rel={rel || "noopener noreferrer"}
          >
            {sharedContent}
          </a>
        )
      }
    }

    // Default: render as button if no href is provided
    return (
      <button
        style={sharedStyle}
        className={sharedClassName}
        ref={ref as React.ForwardedRef<HTMLButtonElement>}
        {...props}
      >
        {sharedContent}
      </button>
    )
  }
)

ShimmerButton.displayName = "ShimmerButton"
