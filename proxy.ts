import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";

const PUBLIC_PATHS = ["/", "/login", "/signup"];

function isPublicPass(path: string) {
  return (
    path.startsWith("/pass/") ||
    path.startsWith("/join/") ||
    path.startsWith("/visit/") ||
    // /door pages manage their own auth via the scanner-device cookie
    // (see src/lib/device.ts). Let them through here.
    path === "/door" ||
    path.startsWith("/door/")
  );
}

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (isPublicPass(path)) return NextResponse.next();

  const token = req.cookies.get("gympass_session")?.value;
  const session = await decrypt(token);
  const isAuthed = Boolean(session?.userId);

  const isPublic = PUBLIC_PATHS.includes(path);

  if (!isPublic && !isAuthed) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isAuthed && (path === "/login" || path === "/signup" || path === "/")) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)"],
};
