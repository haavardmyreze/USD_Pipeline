// Shared UI icons. One source of truth — never inline these in components.

type IconProps = {
  size?: number
  strokeWidth?: number
}

function iconAttrs({ size = 16, strokeWidth = 1.9 }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  } as const
}

export const SettingsIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs({ size: 18, strokeWidth: 1.8, ...props })}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

export const BackIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs(props)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export const ContentsIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs(props)}>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </svg>
)

export const SearchIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs(props)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

export const CommentsIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs(props)}>
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    <path d="M8 9h8" />
    <path d="M8 13h5" />
  </svg>
)

export const AskIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs(props)}>
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
  </svg>
)

export const CloseIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs(props)}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
)

export const PlusIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs({ size: 26, strokeWidth: 1.6, ...props })}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
)

export const ClipboardIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs({ size: 26, strokeWidth: 1.6, ...props })}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
  </svg>
)

export const DrawIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs(props)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

export const LaserIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs(props)}>
    <circle cx="12" cy="11" r="2.5" fill="currentColor" stroke="none" />
    <path d="M12 13.5V20" />
    <path d="M9.5 18h5" opacity="0.65" />
    <path d="M6 8l2 1.5" opacity="0.45" />
    <path d="M18 8l-2 1.5" opacity="0.45" />
  </svg>
)

export const PenIcon = DrawIcon

export const MarkerIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs(props)}>
    <path d="M4 20h16" />
    <path d="m7 17 8.5-8.5a2.12 2.12 0 0 1 3 3L10 20H7z" />
    <path d="m14 6 4 4" />
  </svg>
)

export const EraserIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs(props)}>
    <path d="M7 21h13" />
    <path d="m19 12-6.5 6.5a2.12 2.12 0 0 1-3 0L5 13.5a2.12 2.12 0 0 1 0-3L11.5 4a2.12 2.12 0 0 1 3 0L19 8.5" />
  </svg>
)

export const MarkdownFormatIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs({ size: 18, strokeWidth: 1.8, ...props })}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M8 13h8" />
    <path d="M8 17h5" />
  </svg>
)

export const PdfFormatIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs({ size: 18, strokeWidth: 1.8, ...props })}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M8 11h8" />
    <path d="M8 15h6" />
  </svg>
)

export const CsvFormatIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs({ size: 18, strokeWidth: 1.8, ...props })}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M3 16h18" />
    <path d="M9 4v16" />
    <path d="M15 4v16" />
  </svg>
)

export const ImageFormatIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs({ size: 18, strokeWidth: 1.8, ...props })}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m21 17-5.5-5.5a1.5 1.5 0 0 0-2.12 0L7 18" />
  </svg>
)

export const CodeFormatIcon = (props: IconProps = {}) => (
  <svg {...iconAttrs({ size: 18, strokeWidth: 1.8, ...props })}>
    <path d="M16 18 22 12 16 6" />
    <path d="m8 6-6 6 6 6" />
    <path d="M14 4 10 20" opacity="0.45" />
  </svg>
)
