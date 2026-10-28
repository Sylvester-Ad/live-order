import { Link } from "react-router-dom";

export function Brand({ inverse = false, link = true }: { inverse?: boolean; link?: boolean }) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-xl bg-brand-700 text-xs font-black tracking-tight text-white shadow-sm"
      >
        LO
      </span>
      <span className={inverse ? "text-lg font-bold text-white" : "text-lg font-bold text-ink"}>
        LiveOrder
      </span>
    </>
  );

  return link ? (
    <Link aria-label="LiveOrder home" className="inline-flex items-center gap-3" to="/">
      {content}
    </Link>
  ) : (
    <div aria-label="LiveOrder" className="inline-flex items-center gap-3">
      {content}
    </div>
  );
}
