import { logout } from "@/lib/auth-actions";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="text-sm px-3 py-1.5 border rounded-md hover:bg-neutral-100"
      >
        Çıxış
      </button>
    </form>
  );
}
