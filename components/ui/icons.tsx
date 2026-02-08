import type { ComponentProps } from "react";

interface IconProps extends ComponentProps<"svg"> {
    title?: string;
}

// Inline arrow icon for buttons to avoid external icon dependencies.
export const ArrowRightIcon = ({ title = "Arrow right", ...props }: IconProps) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : "presentation"}
        {...props}
    >
        {title ? <title>{title}</title> : null}
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
    </svg>
);

// Inline Instagram glyph for footer social link.
export const InstagramIcon = ({ title = "Instagram", ...props }: IconProps) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : "presentation"}
        {...props}
    >
        {title ? <title>{title}</title> : null}
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37a4 4 0 1 1-7.94 1.57" />
        <circle cx="17.5" cy="6.5" r="1" />
    </svg>
);

// Inline mail icon for the contact link.
export const MailIcon = ({ title = "Mail", ...props }: IconProps) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : "presentation"}
        {...props}
    >
        {title ? <title>{title}</title> : null}
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 6-10 7L2 6" />
    </svg>
);
