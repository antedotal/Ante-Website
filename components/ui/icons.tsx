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

// Apple logo for iOS App Store download button.
export const AppleIcon = ({ title = "Apple", ...props }: IconProps) => (
    <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : "presentation"}
        {...props}
    >
        {title ? <title>{title}</title> : null}
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
);

// Android robot logo for Google Play download button.
export const AndroidIcon = ({ title = "Android", ...props }: IconProps) => (
    <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : "presentation"}
        {...props}
    >
        {title ? <title>{title}</title> : null}
        <path d="M17.523 2.244a.667.667 0 0 0-.91.248l-1.46 2.56A8.526 8.526 0 0 0 12 4.476a8.526 8.526 0 0 0-3.153.576l-1.46-2.56a.667.667 0 1 0-1.157.662l1.387 2.433A8.088 8.088 0 0 0 3.6 11.333h16.8a8.088 8.088 0 0 0-4.017-5.746l1.387-2.433a.667.667 0 0 0-.248-.91zM8.667 9.333a.667.667 0 1 1 0-1.333.667.667 0 0 1 0 1.333zm6.666 0a.667.667 0 1 1 0-1.333.667.667 0 0 1 0 1.333zM3.6 12.667a1 1 0 0 0-1 1v5.333a1 1 0 0 0 2 0v-5.333a1 1 0 0 0-1-1zm17.8 0a1 1 0 0 0-1 1v5.333a1 1 0 0 0 2 0v-5.333a1 1 0 0 0-1-1zM4.6 12h14.8v7.333a1.333 1.333 0 0 1-1.333 1.334H5.933A1.333 1.333 0 0 1 4.6 19.333V12zm2.733 10a1 1 0 0 0 1 1h.667a1 1 0 0 0 1-1v-1.333h-2.667V22zm6.667 0a1 1 0 0 0 1 1h.667a1 1 0 0 0 1-1v-1.333H14V22z" />
    </svg>
);
