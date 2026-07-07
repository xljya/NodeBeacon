import type { OsSlug } from "../../lib/format";

/** Small OS family logo, ported from the prototype (debian is the fallback). */
export function OsLogo({ slug }: { slug: OsSlug }) {
  if (slug === "windows") {
    return (
      <svg viewBox="0 0 24 24" className="os-svg" fill="#3b8eea">
        <path d="M3 5.7 10.6 4.6v6.9H3zM11.7 4.45 21 3.1v8.4h-9.3zM3 12.6h7.6v6.8L3 18.3zM11.7 12.6H21V21l-9.3-1.28z" />
      </svg>
    );
  }
  if (slug === "ubuntu") {
    return (
      <svg viewBox="0 0 24 24" className="os-svg">
        <circle cx="12" cy="12" r="7.4" fill="none" stroke="#e95420" strokeWidth="1.7" />
        <circle cx="12" cy="4.4" r="1.7" fill="#e95420" />
        <circle cx="5.1" cy="15.6" r="1.7" fill="#e95420" />
        <circle cx="18.9" cy="15.6" r="1.7" fill="#e95420" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className="os-svg"
      fill="none"
      stroke="#d80150"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M16.4 7.2A6.2 6.2 0 1 0 18 12.6" />
      <path d="M14.6 9.1A3.8 3.8 0 1 0 15.6 13" />
    </svg>
  );
}
