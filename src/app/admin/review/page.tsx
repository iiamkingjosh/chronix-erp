import { notFound } from "next/navigation";
import ReviewGrid from "./ReviewGrid";

/**
 * Server component — guards the route at the framework level.
 * In production the Next.js runtime calls notFound() and returns
 * a real HTTP 404 so the page is completely inaccessible.
 * Only visible when running `next dev`.
 */
export default function AdminReviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <ReviewGrid />;
}
