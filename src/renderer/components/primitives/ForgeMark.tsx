export function ForgeMark({ className }: { readonly className: string }) {
  return (
    <svg
      className={`forge-mark ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 4.5H19.5L17.25 8.25H9V19.5H5V4.5Z" fill="currentColor" />
      <path d="M11 10.75H16.75L14.75 14.25H11V10.75Z" fill="currentColor" />
    </svg>
  );
}
