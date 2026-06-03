// app/api/audits/route.js
// Returns audit history for a logged-in user
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const email  = searchParams.get("email");

    if (!userId && !email) {
      return NextResponse.json({ error: "userId or email required" }, { status: 400 });
    }

    let query = supabase
      .from("audit_submissions")
      .select(`
        id, created_at, industry, team_size, revenue_tier, region,
        biggest_challenge, ai_score, currency, ai_report,
        response_speed, admin_hours, no_show_impact, wants_roadmap,
        lead_name, lead_company
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    if (userId) query = query.eq("user_id", userId);
    else         query = query.eq("lead_email", email);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ audits: data || [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
