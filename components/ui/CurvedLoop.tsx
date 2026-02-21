"use client";

import { useRef, useEffect, useState, useMemo, useId } from "react";

// Props for the curved marquee text animation.
interface CurvedLoopProps {
  /** The text to display in the curved marquee. */
  marqueeText: string;
  /** Animation speed in px/frame (default 2). */
  speed?: number;
  /** CSS class name applied to the SVG <text> element for styling. */
  className?: string;
  /** Amount of vertical curve in the text path in px (default 400). */
  curveAmount?: number;
  /** Scroll direction — "left" or "right" (default "left"). */
  direction?: "left" | "right";
  /** Whether the marquee can be dragged by the user (default true). */
  interactive?: boolean;
  /** Font size for the SVG text (default "6rem"). */
  fontSize?: string;
  /** Fill colour for the SVG text (default "#ffffff"). */
  fill?: string;
}

/**
 * Animated curved-path marquee text using an SVG textPath.
 * Adapted from react-bits CurvedLoop component.
 * Continuously scrolls text along a quadratic bezier curve inside an SVG viewport.
 */
export default function CurvedLoop({
  marqueeText = "",
  speed = 2,
  className,
  curveAmount = 400,
  direction = "left",
  interactive = true,
  fontSize = "6rem",
  fill = "#ffffff",
}: CurvedLoopProps) {
  // Normalise trailing whitespace to a single non-breaking space for seamless wrapping.
  const text = useMemo(() => {
    const trimmed = marqueeText.replace(/\s+$/, "");
    return trimmed + "\u00A0";
  }, [marqueeText]);

  const measureRef = useRef<SVGTextElement>(null);
  const textPathRef = useRef<SVGTextPathElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [spacing, setSpacing] = useState(0);
  const offsetRef = useRef(0);
  const uid = useId();
  const pathId = `curve-${uid}`;

  // Quadratic bezier path spanning the SVG viewBox with configurable vertical curve.
  const pathD = `M-100,40 Q500,${40 + curveAmount} 1540,40`;

  // Compute viewBox dimensions to encompass the full curve (handles upward arcs with negative curveAmount).
  const curveY = 40 + curveAmount;
  const viewMinY = Math.min(0, curveY - 40); // extra padding above the curve peak
  const viewMaxY = Math.max(120, curveY + 80);
  const viewHeight = viewMaxY - viewMinY;
  const dynamicViewBox = `0 ${viewMinY} 1440 ${viewHeight}`;
  const dynamicAspectRatio = `${1440} / ${viewHeight}`;

  const dragRef = useRef(false);
  const lastXRef = useRef(0);
  const dirRef = useRef(direction);
  const velRef = useRef(0);

  // Repeat the text enough times to seamlessly tile across 1800px of path length.
  const textLength = spacing;
  const totalText = textLength
    ? Array(Math.ceil(1800 / textLength) + 2)
        .fill(text)
        .join("")
    : text;
  const ready = spacing > 0;

  // Measure the rendered width of a single text repeat once mounted.
  useEffect(() => {
    if (measureRef.current) setSpacing(measureRef.current.getComputedTextLength());
  }, [text, className]);

  // Set initial offset to -spacing so text starts just off the left edge.
  useEffect(() => {
    if (!spacing) return;
    if (textPathRef.current) {
      const initial = -spacing;
      textPathRef.current.setAttribute("startOffset", initial + "px");
      offsetRef.current = initial;
    }
  }, [spacing]);

  // requestAnimationFrame loop — translates textPath offset each frame.
  useEffect(() => {
    if (!spacing || !ready) return;
    let frame = 0;
    const step = () => {
      if (!dragRef.current && textPathRef.current) {
        const delta = dirRef.current === "right" ? speed : -speed;
        const currentOffset = parseFloat(textPathRef.current.getAttribute("startOffset") || "0");
        let newOffset = currentOffset + delta;

        // Wrap around so text appears infinite.
        const wrapPoint = spacing;
        if (newOffset <= -wrapPoint) newOffset += wrapPoint;
        if (newOffset > 0) newOffset -= wrapPoint;

        textPathRef.current.setAttribute("startOffset", newOffset + "px");
        offsetRef.current = newOffset;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [spacing, speed, ready]);

  // Pointer drag handlers — dragging reverses direction based on gesture.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    dragRef.current = true;
    lastXRef.current = e.clientX;
    velRef.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive || !dragRef.current || !textPathRef.current) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    velRef.current = dx;

    const currentOffset = parseFloat(textPathRef.current.getAttribute("startOffset") || "0");
    let newOffset = currentOffset + dx;

    const wrapPoint = spacing;
    if (newOffset <= -wrapPoint) newOffset += wrapPoint;
    if (newOffset > 0) newOffset -= wrapPoint;

    textPathRef.current.setAttribute("startOffset", newOffset + "px");
    offsetRef.current = newOffset;
  };

  const endDrag = () => {
    if (!interactive) return;
    dragRef.current = false;
    dirRef.current = velRef.current > 0 ? "right" : "left";
  };

  const cursorStyle = interactive ? (dragRef.current ? "grabbing" : "grab") : "auto";

  const maskId = `fade-mask-${uid}`;

  return (
    <div
      className="flex items-center justify-center w-full"
      style={{ visibility: ready ? "visible" : "hidden", cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <svg
        className="select-none w-full overflow-visible block font-bold uppercase leading-none"
        viewBox={dynamicViewBox}
        style={{ fontSize, fill, aspectRatio: dynamicAspectRatio }}
      >
        {/* Hidden text for measuring single-repeat width */}
        <text
          ref={measureRef}
          xmlSpace="preserve"
          style={{ visibility: "hidden", opacity: 0, pointerEvents: "none" }}
        >
          {text}
        </text>
        <defs>
          <path ref={pathRef} id={pathId} d={pathD} fill="none" stroke="transparent" />
          {/* Horizontal fade+blur mask: transparent at edges with soft blur, opaque in the middle */}
          <linearGradient id={maskId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="8%" stopColor="white" stopOpacity="1" />
            <stop offset="92%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <filter id={`${maskId}-blur`}>
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <mask id={`${maskId}-m`}>
            <rect x="-200" y="-200" width="1840" height="520" fill={`url(#${maskId})`} filter={`url(#${maskId}-blur)`} />
          </mask>
        </defs>

        {ready && (
          <g mask={`url(#${maskId}-m)`}>
            <text fontWeight="bold" xmlSpace="preserve" className={className}>
              <textPath
                ref={textPathRef}
                href={`#${pathId}`}
                startOffset="0px"
                xmlSpace="preserve"
              >
                {totalText}
              </textPath>
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
