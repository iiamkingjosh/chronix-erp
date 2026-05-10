import { redirect } from "next/navigation";

/** Legacy URL — registration lives on `/login` (Create account tab). */
export default function RegisterRedirectPage() {
  redirect("/login?mode=register");
}
