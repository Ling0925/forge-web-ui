export function ForgeMark({ className }: { readonly className: string }) {
  return (
    <img
      className={`forge-mark ${className}`}
      src="/forge-mark-v3.png"
      width={256}
      height={256}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
