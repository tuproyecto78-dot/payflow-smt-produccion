import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ service: "PayFlow SMT API", ok: true });
}
