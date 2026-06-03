// app/api/email/route.js
// Sends audit report to: (1) the user, (2) your master email
// Uses Nodemailer with Gmail SMTP (or any SMTP provider)

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

const MASTER_EMAIL = process.env.MASTER_EMAIL; // your admin email

function buildEmailHTML({ lead, formData, aiReport, score, currency, fmt }) {
  const bizLabel = {
    "real-estate-sales":"Real Estate","agency":"Agency","consulting":"Consulting",
    "coaching":"Coaching","clinic":"Clinic / Healthcare","wellness":"Wellness",
    "retail":"Retail","ecommerce":"E-commerce","restaurant":"Restaurant",
    "saas":"SaaS","legal":"Legal / Finance","other":"Business",
  }[formData?.industry] || "Business";

  const scoreColor = score >= 68 ? "#10b981" : score >= 42 ? "#f59e0b" : "#ef4444";
  const scoreLabel = score >= 68 ? "Moderate" : score >= 42 ? "At Risk" : "Critical";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Your Estate Flow AI Growth Report</title>
<style>
  body { margin:0; padding:0; background:#07080f; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; color:#eceef8; }
  .wrapper { max-width:620px; margin:0 auto; padding:40px 20px; }
  .logo { display:flex; align-items:center; gap:10px; margin-bottom:40px; }
  .logo-mark { width:38px; height:38px; border-radius:8px; background:linear-gradient(135deg,#6366f1,#06b6d4); display:inline-flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; color:#fff; }
  .logo-text { font-size:17px; font-weight:700; color:#eceef8; }
  .logo-text span { color:#6366f1; }
  .hero { background:linear-gradient(135deg,rgba(99,102,241,0.12),rgba(6,182,212,0.06)); border:1px solid rgba(99,102,241,0.25); border-radius:16px; padding:32px; margin-bottom:24px; text-align:center; }
  .hero h1 { font-size:26px; font-weight:800; margin:0 0 8px; letter-spacing:-0.02em; color:#eceef8; }
  .hero p { font-size:14px; color:#7b80a0; margin:0; }
  .score-ring { width:100px; height:100px; margin:24px auto 16px; position:relative; }
  .score-num { font-size:32px; font-weight:700; color:${scoreColor}; }
  .score-label { display:inline-block; padding:4px 12px; border-radius:100px; font-size:12px; font-weight:600; background:${scoreColor}20; color:${scoreColor}; border:1px solid ${scoreColor}40; margin-top:8px; }
  .section { margin-bottom:20px; }
  .section-title { font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#3a3e58; margin-bottom:12px; }
  .stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .stat-card { background:#0d0f1a; border:1px solid #1a1d2e; border-radius:10px; padding:16px; }
  .stat-label { font-size:10px; color:#3a3e58; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px; }
  .stat-value { font-size:20px; font-weight:700; font-family:monospace; }
  .red { color:#ef4444; } .yellow { color:#f59e0b; } .green { color:#10b981; }
  .ai-section { background:linear-gradient(135deg,rgba(99,102,241,0.07),rgba(6,182,212,0.04)); border:1px solid rgba(99,102,241,0.2); border-radius:12px; padding:24px; margin-bottom:20px; }
  .ai-section h3 { font-size:14px; font-weight:700; color:#eceef8; margin:0 0 14px; }
  .ai-text { font-size:14px; color:#7b80a0; line-height:1.85; white-space:pre-wrap; }
  .cta-block { background:#05070F; border:2px solid rgba(200,169,110,0.4); border-radius:16px; padding:36px; text-align:center; margin-bottom:20px; }
  .cta-block h2 { font-size:22px; font-weight:800; margin:0 0 10px; color:#eceef8; }
  .cta-block p { font-size:14px; color:#7b80a0; margin:0 0 24px; line-height:1.7; }
  .cta-btn { display:inline-block; background:linear-gradient(135deg,#6366f1,#06b6d4); color:#fff; padding:14px 32px; border-radius:10px; font-size:15px; font-weight:700; text-decoration:none; letter-spacing:-0.01em; }
  .footer { text-align:center; font-size:12px; color:#3a3e58; padding-top:20px; border-top:1px solid #1a1d2e; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="logo">
    <span class="logo-mark">EF</span>
    <span class="logo-text">Estate Flow<span> AI</span></span>
  </div>

  <div class="hero">
    <h1>Your AI Growth Audit is Ready</h1>
    <p>${bizLabel} · ${formData?.teamSize || ""} team · ${formData?.region || ""}</p>
    <div class="score-ring">
      <div class="score-num">${score}</div>
      <div style="font-size:12px;color:#7b80a0">/100</div>
    </div>
    <span class="score-label">${scoreLabel}</span>
  </div>

  <div class="section">
    <div class="section-title">Estimated Revenue Leak</div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Monthly Leak</div>
        <div class="stat-value red">${fmt?.monthly || "See report"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Annual at Risk</div>
        <div class="stat-value red">${fmt?.annual || "See report"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Response Loss</div>
        <div class="stat-value yellow">${fmt?.response || "See report"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Follow-Up Leak</div>
        <div class="stat-value yellow">${fmt?.followup || "See report"}</div>
      </div>
    </div>
  </div>

  ${aiReport ? `
  <div class="ai-section">
    <h3>◈ AI Growth Analysis</h3>
    <div class="ai-text">${aiReport}</div>
  </div>
  ` : ""}

  <div class="cta-block">
    <h2>Ready to recover this revenue?</h2>
    <p>Book a free 30-minute strategy call and we'll walk you through exactly how to implement AI systems that fix the gaps above — in 30 days.</p>
    <a href="https://calendly.com/charanrathod-inf/30min" class="cta-btn">📅 Book Your Free Strategy Call →</a>
    <div style="margin-top:16px;font-size:11px;color:#3a3e58;">30-Min Confidential Session · No Commitment · Estate Flow AI Specialists</div>
  </div>

  <div class="footer">
    <p>You received this because you completed an Estate Flow AI Growth Audit.</p>
    <p style="margin-top:6px;">© ${new Date().getFullYear()} Estate Flow AI. All rights reserved.</p>
  </div>
</div>
</body>
</html>`;
}

function buildMasterEmailHTML({ lead, formData, aiReport, score, currency }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><style>
body{font-family:monospace;background:#07080f;color:#eceef8;padding:24px;}
table{width:100%;border-collapse:collapse;}
td{padding:8px 12px;border-bottom:1px solid #1a1d2e;font-size:13px;}
td:first-child{color:#7b80a0;width:200px;}
.score{font-size:28px;font-weight:700;color:${score>=68?"#10b981":score>=42?"#f59e0b":"#ef4444"};}
.report{background:#0d0f1a;border:1px solid #1a1d2e;border-radius:8px;padding:16px;margin-top:16px;font-size:13px;line-height:1.7;color:#7b80a0;white-space:pre-wrap;}
</style></head>
<body>
<h2 style="color:#6366f1;margin-bottom:4px;">🎯 New Audit Submission</h2>
<p style="color:#7b80a0;font-size:13px;margin-bottom:20px;">${new Date().toLocaleString()}</p>

<div class="score">${score}/100</div>
<p style="color:#7b80a0;font-size:12px;">AI Growth Score</p>

<table>
  <tr><td>Name</td><td>${lead?.name || "—"}</td></tr>
  <tr><td>Email</td><td>${lead?.email || "—"}</td></tr>
  <tr><td>Company</td><td>${lead?.company || "—"}</td></tr>
  <tr><td>Phone</td><td>${lead?.phone || "—"}</td></tr>
  <tr><td>Industry</td><td>${formData?.industry || "—"}</td></tr>
  <tr><td>Team Size</td><td>${formData?.teamSize || "—"}</td></tr>
  <tr><td>Revenue Tier</td><td>${formData?.revTier || "—"}</td></tr>
  <tr><td>Region / Currency</td><td>${formData?.region || "—"} · ${currency || "—"}</td></tr>
  <tr><td>Biggest Challenge</td><td>${formData?.biggestChallenge || "—"}</td></tr>
  <tr><td>Response Speed</td><td>${formData?.responseSpeed || "—"}</td></tr>
  <tr><td>Follow-Up Method</td><td>${Array.isArray(formData?.followUpMethod)?formData.followUpMethod.join(", "):"—"}</td></tr>
  <tr><td>Admin Hours/Week</td><td>${formData?.adminHours || "—"}</td></tr>
  <tr><td>No-Show Impact</td><td>${formData?.noShowImpact || "—"}</td></tr>
  <tr><td>Used AI Before</td><td>${formData?.usedAI || "—"}</td></tr>
  <tr><td>Wants Roadmap</td><td>${formData?.wantsRoadmap || "—"}</td></tr>
  <tr><td>Would Automate</td><td>${formData?.automateOne || "—"}</td></tr>
  <tr><td>Growth Goals</td><td>${formData?.growthGoals || "—"}</td></tr>
</table>

${aiReport ? `<div class="report">${aiReport}</div>` : ""}
</body>
</html>`;
}

export async function POST(req) {
  try {
    const { lead, formData, aiReport, score, currency, fmt } = await req.json();

    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   || "smtp.gmail.com",
      port:   Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const results = [];

    // 1. Email to the user
    if (lead?.email) {
      try {
        await transporter.sendMail({
          from:    `"Estate Flow AI" <${process.env.SMTP_USER}>`,
          to:      lead.email,
          subject: `Your AI Growth Audit — Score: ${score}/100`,
          html:    buildEmailHTML({ lead, formData, aiReport, score, currency, fmt }),
        });
        results.push({ to: lead.email, sent: true });
      } catch (e) {
        console.error("User email error:", e);
        results.push({ to: lead.email, sent: false, error: e.message });
      }
    }

    // 2. Copy to master email
    if (MASTER_EMAIL) {
      try {
        await transporter.sendMail({
          from:    `"Estate Flow AI" <${process.env.SMTP_USER}>`,
          to:      MASTER_EMAIL,
          subject: `[NEW AUDIT] ${lead?.name || "Anonymous"} · ${lead?.email || ""} · Score ${score}/100`,
          html:    buildMasterEmailHTML({ lead, formData, aiReport, score, currency }),
        });
        results.push({ to: MASTER_EMAIL, sent: true });
      } catch (e) {
        console.error("Master email error:", e);
        results.push({ to: MASTER_EMAIL, sent: false, error: e.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("email route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
