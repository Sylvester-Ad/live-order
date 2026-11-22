import { Link } from "react-router-dom";

export function Brand({ inverse = false, link = true, to = "/" }: { inverse?: boolean; link?: boolean; to?: string }) {
  const content = (
    <>
      <img alt="" aria-hidden="true" className="size-10 shrink-0" src="/liveorder-mark.svg" />
      <span className={inverse ? "text-lg font-bold tracking-tight text-white" : "text-lg font-bold tracking-tight text-ink"}>
        LiveOrder
      </span>
    </>
  );

  return link ? (
    <Link aria-label="LiveOrder home" className="inline-flex items-center gap-3" to={to}>
      {content}
    </Link>
  ) : (
    <div className="inline-flex items-center gap-3">
      {content}
    </div>
  );
}
