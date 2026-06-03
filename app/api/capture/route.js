// app/api/capture/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { lead = {}, formData = {}, aiReport = "", score, currency, userId } = await req.json();

    const record = {
      user_id:              userId || null,
      lead_name:            lead.name    || null,
      lead_email:           lead.email   || null,
      lead_phone:           lead.phone   || null,
      lead_company:         lead.company || null,
      industry:             formData.industry           || null,
      team_size:            formData.teamSize           || null,
      revenue_tier:         formData.revTier            || null,
      region:               formData.region             || null,
      biggest_challenge:    formData.biggestChallenge   || null,
      growth_goals:         formData.growthGoals        || null,
      response_speed:       formData.responseSpeed      || null,
      out_of_hours:         formData.outOfHours         || null,
      follow_up_method:     Array.isArray(formData.followUpMethod) ? formData.followUpMethod.join(", ") : null,
      loses_leads:          formData.losesLeads         || null,
      appointment_booking:  formData.appointmentBooking || null,
      sales_inefficiency:   formData.salesInefficiency  || null,
      time_consuming_tasks: Array.isArray(formData.timeConsumingTasks) ? formData.timeConsumingTasks.join(", ") : null,
      admin_hours:          formData.adminHours         || null,
      repetitive_questions: formData.repetitiveQuestions || null,
      appt_management:      Array.isArray(formData.apptManagement) ? formData.apptManagement.join(", ") : null,
      operational_bottleneck: formData.operationalBottleneck || null,
      no_show_impact:       formData.noShowImpact       || null,
      contact_channels:     Array.isArray(formData.contactChannels) ? formData.contactChannels.join(", ") : null,
      cx_out_of_hours:      formData.cxOutOfHours       || null,
      repeat_questions:     formData.repeatQuestions    || null,
      customer_frustration: formData.customerFrustration || null,
      used_ai:              formData.usedAI             || null,
      ai_concerns:          Array.isArray(formData.aiConcerns) ? formData.aiConcerns.join(", ") : null,
      automate_one:         formData.automateOne        || null,
      wants_roadmap:        formData.wantsRoadmap       || null,
      ai_score:             score    || null,
      currency:             currency || null,
      ai_report:            aiReport || null,
      source:               "reel-audit",
      created_at:           new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("audit_submissions")
      .insert([record])
      .select("id")
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
