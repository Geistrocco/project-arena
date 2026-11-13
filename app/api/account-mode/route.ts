import { NextResponse } from "next/server";
import { getAccountContext } from "@/lib/account-context";
export async function GET() {
  const { user, mode } = await getAccountContext();
  return NextResponse.json({ mode: user ? mode : null }, { headers: { "Cache-Control": "private, no-store" } });
}
