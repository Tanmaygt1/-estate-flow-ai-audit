// app/api/generate-pdf/route.js
// Generates a clean, print-optimised PDF from audit data
// Light theme designed for maximum readability when printed

import { NextResponse } from "next/server";

const INDUSTRY_LABELS = {
  "real-estate-sales":"Real Estate","real-estate-dev":"Real Estate Development",
  "property-mgmt":"Property Management","agency":"Agency","consulting":"Consulting",
  "legal":"Legal / Finance","recruitment":"Recruitment","coaching":"Coaching",
  "clinic":"Clinic / Healthcare","wellness":"Wellness / Fitness","retail":"Retail",
  "ecommerce":"E-commerce","restaurant":"Restaurant / Food","saas":"SaaS",
  "app":"App / Platform","media":"Media / Content","logistics":"Logistics",
  "manufacturing":"Manufacturing","hospitality":"Hospitality","other":"Business",
};

const REGION_LABELS = {
  uk:"United Kingdom",usa:"United States",europe:"Europe",india:"India",
  uae:"UAE / Gulf",australia:"Australia",canada:"Canada",singapore:"Singapore",other:"Global",
};

const REV_MID = { tier1:5000, tier2:25000, tier3:120000, tier4:350000 };

function calcScore(d){
  let score = 100;
  const followUp = Array.isArray(d.followUpMethod) ? d.followUpMethod : [];
  const adminHrMap = {"0-5hrs":2.5,"5-10hrs":7.5,"10-20hrs":15,"20+hrs":25};
  const weeklyAdminHrs = adminHrMap[d.adminHours] || 7.5;
  const monthlyAdminHrs = Math.round(weeklyAdminHrs * 4.33);
  const revMid = REV_MID[d.revTier] || 25000;
  const teamN = {"1-5":3,"6-15":10,"16-50":30,"50+":60}[d.teamSize] || 5;
  const respPenalty = d.responseSpeed==="longer"?0.35:d.responseSpeed==="within-24hr"?0.20:d.responseSpeed==="within-1hr"?0.08:0;
  if(d.responseSpeed==="longer") score-=24;
  else if(d.responseSpeed==="within-24hr") score-=16;
  else if(d.responseSpeed==="within-1hr") score-=6;
  if(d.outOfHours==="no-process-oos"||d.outOfHours==="next-day") score-=12;
  if(followUp.includes("no-follow-up")) score-=18;
  else if(!followUp.includes("crm-automation")&&!followUp.includes("emails")) score-=6;
  if(d.losesLeads==="yes") score-=6;
  if(d.appointmentBooking==="manual-appt") score-=6;
  if(d.adminHours==="20+hrs") score-=16;
  else if(d.adminHours==="10-20hrs") score-=10;
  else if(d.adminHours==="5-10hrs") score-=4;
  if(d.repetitiveQuestions==="yes-faq") score-=4;
  if(d.noShowImpact==="frequently") score-=10;
  else if(d.noShowImpact==="occasionally") score-=4;
  if(d.cxOutOfHours==="no-cx-oos") score-=8;
  if(d.repeatQuestions==="yes-repeat") score-=4;
  if(d.usedAI==="no-ai") score-=4;
  score = Math.max(8, Math.min(100, score));
  const hourlyRate = Math.round(revMid/160/teamN*2);
  const adminWasteCost = Math.round(monthlyAdminHrs * hourlyRate);
  const conversionLoss = Math.round(revMid * respPenalty * 0.3);
  const afterHoursMiss = (d.outOfHours==="next-day"||d.outOfHours==="no-process-oos") ? Math.round(revMid*0.12) : 0;
  const followUpLoss = followUp.includes("no-follow-up") ? Math.round(revMid*0.20) : Math.round(revMid*0.08);
  const noShowCost = d.noShowImpact==="frequently" ? Math.round(revMid*0.08) : d.noShowImpact==="occasionally" ? Math.round(revMid*0.04) : 0;
  const totalMonthlyLeak = conversionLoss + afterHoursMiss + followUpLoss + adminWasteCost + noShowCost;
  return { score, weeklyAdminHrs, monthlyAdminHrs, adminWasteCost, conversionLoss, afterHoursMiss, followUpLoss, noShowCost, totalMonthlyLeak, totalAnnualLeak: totalMonthlyLeak*12, followUp };
}

const CURRENCY_SYMBOLS = {
  GBP:"£", USD:"$", EUR:"€", INR:"₹", AED:"AED ", AUD:"A$", CAD:"C$", SGD:"S$",
  CHF:"CHF ", JPY:"¥", NZD:"NZ$", SEK:"kr", NOK:"kr", DKK:"kr", ZAR:"R", HKD:"HK$",
};

function resolveCurrencySymbol(currency, sym) {
  if (typeof sym === "string" && sym.trim()) return sym.trim();
  const code = String(currency || "").toUpperCase();
  return CURRENCY_SYMBOLS[code] || code || "£";
}

function fmt(n, sym, currency) {
  const v = Math.round(Number(n));
  const s = resolveCurrencySymbol(currency, sym);
  if (s === "₹") return "₹" + v.toLocaleString("en-IN");
  return s + v.toLocaleString("en-GB");
}

function barWidth(fd) {
  return {
    response: fd.responseSpeed==="instantly"?100:fd.responseSpeed==="within-1hr"?72:fd.responseSpeed==="within-24hr"?38:12,
    afterHours: fd.outOfHours==="automation-oos"?100:fd.outOfHours==="manual-oos"?60:fd.outOfHours==="next-day"?25:5,
    admin: fd.adminHours==="0-5hrs"?15:fd.adminHours==="5-10hrs"?40:fd.adminHours==="10-20hrs"?70:95,
    noShow: fd.noShowImpact==="never"?5:fd.noShowImpact==="rarely"?25:fd.noShowImpact==="occasionally"?55:85,
  };
}

function barColor(level) {
  if(level === "green") return "#16A34A";
  if(level === "yellow") return "#D97706";
  return "#DC2626";
}

function buildPDFHTML({ lead, formData, aiReport, score, currency, sym, createdAt }) {
  const fd = formData || {};
  const m = calcScore(fd);
  const bizLabel = INDUSTRY_LABELS[fd.industry] || "Business";
  const regionLabel = REGION_LABELS[fd.region] || fd.region || "—";
  const date = new Date(createdAt || Date.now()).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
  const s = resolveCurrencySymbol(currency, sym);
  const f = (n) => fmt(n, s, currency);
  const scoreColor = score >= 68 ? "#16A34A" : score >= 42 ? "#D97706" : "#DC2626";
  const scoreBg = score >= 68 ? "#F0FDF4" : score >= 42 ? "#FFFBEB" : "#FEF2F2";
  const scoreLabel = score >= 68 ? "Moderate" : score >= 42 ? "At Risk" : "Critical";
  const bars = barWidth(fd);

  const oppCards = [
    {
      title: fd.responseSpeed==="longer"||fd.responseSpeed==="within-24hr" ? "AI Lead Response System — 24/7 Instant Engagement" : "Intelligent Lead Qualification & Routing",
      body: fd.responseSpeed==="longer" ? `Your response time triggers an estimated ${f(m.conversionLoss)}/month in lost conversions. An AI system responding in under 2 minutes — day and night — recovers the majority before leads contact a competitor.` : fd.responseSpeed==="within-24hr" ? `A 24-hour window loses motivated leads to faster competitors. AI-powered instant response is estimated to recover ${f(m.conversionLoss)}/month.` : `With fast response time, the next step is smarter qualification — AI routing ensures every lead reaches the right person instantly.`,
      priority: fd.responseSpeed==="longer" ? "CRITICAL" : fd.responseSpeed==="within-24hr" ? "HIGH" : "MEDIUM",
    },
    {
      title: m.followUp.includes("no-follow-up") ? "Automated Follow-Up Sequences — Stop Losing Warm Leads" : "Multi-Channel Follow-Up Automation",
      body: m.followUp.includes("no-follow-up") ? `No structured follow-up means walking away after first contact. 80% of sales require 5+ touchpoints. Automated sequences could recover ${f(m.followUpLoss)}/month.` : `Your current follow-up (${m.followUp.join(", ")}) is largely manual. Automating with behaviour-triggered sequences typically recovers 20–35% more conversions.`,
      priority: m.followUp.includes("no-follow-up") ? "CRITICAL" : "HIGH",
    },
    {
      title: fd.outOfHours==="no-process-oos"||fd.outOfHours==="next-day" ? "After-Hours AI — Capture Enquiries While You Sleep" : "After-Hours Optimisation",
      body: fd.outOfHours==="no-process-oos"||fd.outOfHours==="next-day" ? `No after-hours process means invisible at peak motivation moments. Estimated ${f(m.afterHoursMiss)}/month slipping away. An AI assistant covers these windows automatically.` : `Full automation increases off-peak conversion by 30–50% without adding headcount.`,
      priority: fd.outOfHours==="no-process-oos"||fd.outOfHours==="next-day" ? "HIGH" : "MEDIUM",
    },
    {
      title: `Workflow Automation — Reclaim ${m.weeklyAdminHrs} Hours/Week`,
      body: `Your team spends ~${m.monthlyAdminHrs} hours/month on repetitive admin — worth ${f(m.adminWasteCost)}/month in labour. AI workflow automation eliminates 60–70% of this within 60 days, freeing your team for revenue-generating work.`,
      priority: fd.adminHours==="20+hrs" ? "CRITICAL" : fd.adminHours==="10-20hrs" ? "HIGH" : "MEDIUM",
    },
  ];

  const priorityColor = (p) => p==="CRITICAL" ? "#DC2626" : p==="HIGH" ? "#D97706" : "#C8A96E";
  const priorityBg   = (p) => p==="CRITICAL" ? "#FEF2F2" : p==="HIGH" ? "#FFFBEB" : "#FDF8EF";
  const priorityBorder = (p) => p==="CRITICAL" ? "#FECACA" : p==="HIGH" ? "#FDE68A" : "#F0DFB8";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Estate Flow AI — Growth Audit Report</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
<style>
/* ── Reset ── */
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:100%;background:#FFFFFF;color:#1A1A1A;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased;}

/* ── Layout ── */
.page{max-width:794px;margin:0 auto;background:#FFFFFF;}

/* ── Header bar (light luxury) ── */
.header{background:#FFFFFF;padding:24px 40px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #C8A96E;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.header-logo{display:flex;align-items:center;gap:10px;}
.logo-mark{width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#C8A96E,#E8C98E);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#1A1A1A;font-family:Georgia,serif;font-style:italic;letter-spacing:-0.04em;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.logo-name{font-size:16px;font-weight:700;color:#1A1A1A;letter-spacing:-0.02em;}
.logo-name span{color:#C8A96E;}
.header-right{text-align:right;}
.header-label{font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#8B6914;}
.header-date{font-size:12px;color:#6B7280;margin-top:2px;}

/* ── Title band ── */
.title-band{background:#F8F6F2;border-bottom:3px solid #C8A96E;padding:28px 40px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.title-overline{font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#C8A96E;margin-bottom:8px;}
.title-heading{font-size:28px;font-weight:800;color:#1A1A1A;letter-spacing:-0.025em;line-height:1.2;margin-bottom:10px;}
.title-meta{font-size:13px;color:#4A4A5A;font-weight:500;}
.title-meta strong{color:#1A1A1A;font-weight:700;}
.title-person{font-size:12px;color:#6B7280;margin-top:5px;}

/* ── Content area ── */
.content{padding:32px 40px;background:#FFFFFF;}

/* ── Section label ── */
.sec-overline{font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#C8A96E;margin-bottom:4px;}
.sec-title{font-size:16px;font-weight:800;color:#1A1A1A;letter-spacing:-0.015em;margin-bottom:20px;}

/* ── Score card ── */
.score-card{border:1.5px solid #E5E7EB;border-radius:12px;padding:24px;margin-bottom:24px;display:flex;gap:28px;align-items:center;background:#FFFFFF;}
.score-gauge{text-align:center;flex-shrink:0;}
.score-ring{width:96px;height:96px;border-radius:50%;border:7px solid;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 10px;}
.score-num{font-size:26px;font-weight:800;font-family:'JetBrains Mono',monospace;line-height:1;}
.score-denom{font-size:11px;color:#9CA3AF;font-family:'JetBrains Mono',monospace;}
.score-pill{display:inline-block;padding:4px 14px;border-radius:100px;font-size:11px;font-weight:700;border:1.5px solid;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.score-right{}
.score-right-label{font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#9CA3AF;margin-bottom:6px;}
.score-right-heading{font-size:17px;font-weight:800;color:#1A1A1A;line-height:1.3;margin-bottom:8px;}
.score-right-body{font-size:13px;color:#4A4A5A;line-height:1.7;}
.score-right-body strong{color:#1A1A1A;}

/* ── 2-col grid ── */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;}

/* ── Metric card ── */
.metric-card{border:1.5px solid #E5E7EB;border-radius:10px;padding:18px 20px;background:#FFFFFF;page-break-inside:avoid;}
.metric-label{font-size:9px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;color:#6B7280;margin-bottom:6px;}
.metric-value{font-size:24px;font-weight:800;font-family:'JetBrains Mono',monospace;margin-bottom:4px;line-height:1;}
.metric-sub{font-size:11px;color:#6B7280;line-height:1.5;}

/* ── Ops cards ── */
.ops-card{border:1.5px solid #E5E7EB;border-radius:10px;padding:16px 20px;background:#FFFFFF;}
.ops-label{font-size:9px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;color:#6B7280;margin-bottom:5px;}
.ops-value{font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace;line-height:1.1;}
.ops-sub{font-size:11px;color:#6B7280;margin-top:4px;}

/* ── Bar rows ── */
.bars-card{border:1.5px solid #E5E7EB;border-radius:10px;padding:20px;margin-bottom:24px;background:#FFFFFF;}
.bar-row{margin-bottom:16px;}
.bar-row:last-child{margin-bottom:0;}
.bar-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;}
.bar-lbl{font-size:13px;color:#374151;font-weight:500;}
.bar-val{font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;}
.bar-track{height:6px;background:#F3F4F6;border-radius:4px;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.bar-fill{height:100%;border-radius:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.bar-note{font-size:11px;color:#6B7280;margin-top:4px;line-height:1.5;}

/* ── AI Analysis ── */
.ai-card{background:#F8F6F0;border:1.5px solid #E8DCC8;border-left:4px solid #C8A96E;border-radius:12px;padding:28px;margin-bottom:24px;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.ai-header{display:flex;gap:10px;align-items:center;margin-bottom:14px;}
.ai-icon{width:34px;height:34px;border-radius:8px;background:#EFE5D0;border:1px solid #C8A96E;display:flex;align-items:center;justify-content:center;font-size:15px;color:#8B6914;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.ai-title-text{font-size:14px;font-weight:700;color:#1A1A1A;}
.ai-subtitle{font-size:11px;color:#6B7280;}
.ai-body{font-size:13px;color:#374151;line-height:1.9;white-space:pre-wrap;}

/* ── Opportunity cards ── */
.opp-card{border:1.5px solid;border-radius:10px;padding:16px 18px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start;background:#FFFFFF;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.opp-badge{padding:3px 10px;border-radius:100px;font-size:9px;font-weight:800;letter-spacing:0.08em;flex-shrink:0;margin-top:2px;border:1.5px solid;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.opp-title{font-size:13px;font-weight:700;color:#1A1A1A;margin-bottom:5px;line-height:1.3;}
.opp-body{font-size:12px;color:#4A4A5A;line-height:1.65;}

/* ── Growth potential ── */
.growth-card{background:#F8F6F2;border:1.5px solid #E8DCC8;border-radius:12px;padding:24px;margin-bottom:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.growth-num{font-size:38px;font-weight:800;color:#16A34A;font-family:'JetBrains Mono',monospace;line-height:1;margin-bottom:4px;}
.growth-label{font-size:13px;color:#6B7280;margin-bottom:10px;}
.growth-body{font-size:13px;color:#374151;line-height:1.8;}
.growth-body strong{color:#1A1A1A;}

/* ── CTA block ── */
.cta-card{background:#FFFBF0;border:2px solid #C8A96E;border-radius:14px;padding:36px 32px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cta-overline{font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#8B6914;margin-bottom:14px;}
.cta-heading{font-size:22px;font-weight:800;color:#1A1A1A;letter-spacing:-0.02em;margin-bottom:10px;line-height:1.3;}
.cta-body{font-size:13px;color:#4A4A5A;margin-bottom:20px;line-height:1.75;}
.cta-url{display:inline-block;padding:13px 24px;border-radius:999px;background:#C8A96E;color:#FFFFFF;font-weight:800;font-size:14px;text-decoration:none;letter-spacing:0.01em;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cta-trust{display:flex;justify-content:center;gap:18px;margin-top:14px;flex-wrap:wrap;}
.cta-trust span{font-size:10px;color:#8B6914;}

/* ── Footer ── */
.footer{background:#FFFFFF;padding:16px 40px;display:flex;align-items:center;justify-content:space-between;border-top:2px solid #C8A96E;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.footer-text{font-size:10px;color:#6B7280;}
.footer-mono{font-size:10px;color:#6B7280;font-family:'JetBrains Mono',monospace;}

/* ── Divider ── */
.divider{height:1px;background:#F3F4F6;margin:24px 0;}

/* ── Print rules ── */
@media print{
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  html,body{background:#FFFFFF !important;}
  .page{max-width:100%;margin:0;}
  .score-card,.metric-card,.ops-card,.bars-card,.opp-card{page-break-inside:avoid;}
  @page{margin:0;size:A4;}
}
</style>
</head>
<body>
<div class="page">

<!-- HEADER -->
<div class="header">
  <div class="header-logo">
    <div class="logo-mark">EF</div>
    <span class="logo-name">Estate Flow<span> AI</span></span>
  </div>
  <div class="header-right">
    <div class="header-label">AI Growth Audit Report</div>
    <div class="header-date">${date}</div>
  </div>
</div>

<!-- TITLE -->
<div class="title-band">
  <div class="title-overline">Personalised Business Diagnostic</div>
  <div class="title-heading">Your AI Growth<br/>Audit Report</div>
  <div class="title-meta">
    <strong>${bizLabel}</strong> &nbsp;·&nbsp; ${fd.teamSize || "—"} team &nbsp;·&nbsp; Revenue: ${fd.revTier || "—"} &nbsp;·&nbsp; ${regionLabel}
  </div>
  ${lead?.name || lead?.email ? `<div class="title-person">${lead.name || ""}${lead.company ? " · " + lead.company : ""}${lead.email ? " · " + lead.email : ""}</div>` : ""}
</div>

<!-- CONTENT -->
<div class="content">

  <!-- SCORE -->
  <div class="sec-overline">Performance</div>
  <div class="score-card">
    <div class="score-gauge">
      <div class="score-ring" style="border-color:${scoreColor};background:${scoreBg};">
        <div class="score-num" style="color:${scoreColor};">${score}</div>
        <div class="score-denom">/100</div>
      </div>
      <div class="score-pill" style="color:${scoreColor};background:${scoreBg};border-color:${scoreColor}40;">${scoreLabel}</div>
    </div>
    <div class="score-right">
      <div class="score-right-label">AI Growth Score</div>
      <div class="score-right-heading">
        ${score < 42 ? "Critical gaps — significant revenue being left on the table" : score < 68 ? "Several AI opportunities — clear room to grow" : "Good foundation — targeted AI unlocks the next level"}
      </div>
      <div class="score-right-body">
        Top businesses score <strong>75+</strong>. Your score of <strong style="color:${scoreColor};">${score}/100</strong>
        ${score < 42 ? " reveals multiple compounding problems actively costing you revenue every day." : score < 68 ? " shows clear gaps in lead handling, operations, and customer experience." : " shows a solid base with specific automation opportunities ready to unlock growth."}
      </div>
    </div>
  </div>

  <!-- REVENUE LEAK -->
  <div class="sec-overline">Financial Impact</div>
  <div class="sec-title">Revenue Leak — Where Money Is Escaping</div>
  <div class="grid-2">
    <div class="metric-card" style="border-color:#FECACA;">
      <div class="metric-label">Total Monthly Leak</div>
      <div class="metric-value" style="color:#DC2626;">${f(m.totalMonthlyLeak)}</div>
      <div class="metric-sub">Across response, follow-up, admin &amp; no-shows</div>
    </div>
    <div class="metric-card" style="border-color:#FECACA;">
      <div class="metric-label">Annual Revenue at Risk</div>
      <div class="metric-value" style="color:#DC2626;">${f(m.totalAnnualLeak)}</div>
      <div class="metric-sub">If gaps remain unfixed over 12 months</div>
    </div>
    <div class="metric-card" style="border-color:#FDE68A;">
      <div class="metric-label">Response Speed Loss</div>
      <div class="metric-value" style="color:#D97706;">${f(m.conversionLoss)}</div>
      <div class="metric-sub">From ${fd.responseSpeed || "—"} response time</div>
    </div>
    <div class="metric-card" style="border-color:#FDE68A;">
      <div class="metric-label">Follow-Up Leakage</div>
      <div class="metric-value" style="color:#D97706;">${f(m.followUpLoss)}</div>
      <div class="metric-sub">Leads lost to inconsistent follow-up</div>
    </div>
  </div>

  <!-- OPERATIONS -->
  <div class="sec-overline">Operations &amp; Efficiency</div>
  <div class="sec-title">Time &amp; Cost Breakdown</div>
  <div class="grid-2" style="margin-bottom:16px;">
    <div class="ops-card">
      <div class="ops-label">Weekly admin hours wasted</div>
      <div class="ops-value" style="color:#D97706;">${m.weeklyAdminHrs} hrs</div>
      <div class="ops-sub">Team of ${fd.teamSize || "—"}</div>
    </div>
    <div class="ops-card">
      <div class="ops-label">Monthly cost of overhead</div>
      <div class="ops-value" style="color:#DC2626;">${f(m.adminWasteCost)}</div>
      <div class="ops-sub">Estimated labour cost</div>
    </div>
  </div>

  <div class="bars-card">
    <div class="bar-row">
      <div class="bar-header">
        <span class="bar-lbl">Lead response speed</span>
        <span class="bar-val" style="color:${fd.responseSpeed==="instantly"||fd.responseSpeed==="within-1hr"?"#16A34A":fd.responseSpeed==="within-24hr"?"#D97706":"#DC2626"};">${fd.responseSpeed==="instantly"?"Optimal":fd.responseSpeed==="within-1hr"?"Good":fd.responseSpeed==="within-24hr"?"Slow":"Critical"}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${bars.response}%;background:${fd.responseSpeed==="instantly"||fd.responseSpeed==="within-1hr"?"#16A34A":fd.responseSpeed==="within-24hr"?"#D97706":"#DC2626"};"></div></div>
      <div class="bar-note">${fd.responseSpeed==="longer"?"Over 24 hours — highest-impact fix. AI response eliminates this entirely.":fd.responseSpeed==="within-24hr"?"24 hours loses motivated leads. AI in under 2 minutes recovers most of this.":fd.responseSpeed==="within-1hr"?"Good — AI can push this to under 2 min 24/7, including evenings and weekends.":"Optimal — AI ensures this scales without adding headcount."}</div>
    </div>
    <div class="bar-row">
      <div class="bar-header">
        <span class="bar-lbl">After-hours coverage</span>
        <span class="bar-val" style="color:${fd.outOfHours==="automation-oos"?"#16A34A":fd.outOfHours==="manual-oos"?"#D97706":"#DC2626"};">${fd.outOfHours==="automation-oos"?"Automated":fd.outOfHours==="manual-oos"?"Manual":fd.outOfHours==="next-day"?"Next day":"No process"}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${bars.afterHours}%;background:${fd.outOfHours==="automation-oos"?"#16A34A":fd.outOfHours==="manual-oos"?"#D97706":"#DC2626"};"></div></div>
      <div class="bar-note">Missing after-hours enquiries is a continuous, silent revenue drain. Most businesses receive 40–60% of leads outside 9–5.</div>
    </div>
    <div class="bar-row">
      <div class="bar-header">
        <span class="bar-lbl">Admin overhead intensity</span>
        <span class="bar-val" style="color:${fd.adminHours==="0-5hrs"?"#16A34A":fd.adminHours==="5-10hrs"?"#D97706":"#DC2626"};">${fd.adminHours || "—"}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${bars.admin}%;background:${fd.adminHours==="0-5hrs"?"#16A34A":fd.adminHours==="5-10hrs"?"#D97706":"#DC2626"};"></div></div>
      <div class="bar-note">${m.monthlyAdminHrs} hours/month = ${f(m.adminWasteCost)} in labour that AI automation can largely eliminate within 60 days.</div>
    </div>
    <div class="bar-row" style="margin-bottom:0;">
      <div class="bar-header">
        <span class="bar-lbl">No-show / missed appointment impact</span>
        <span class="bar-val" style="color:${fd.noShowImpact==="never"||fd.noShowImpact==="rarely"?"#16A34A":fd.noShowImpact==="occasionally"?"#D97706":"#DC2626"};">${fd.noShowImpact||"—"}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${bars.noShow}%;background:${fd.noShowImpact==="never"||fd.noShowImpact==="rarely"?"#16A34A":fd.noShowImpact==="occasionally"?"#D97706":"#DC2626"};"></div></div>
      <div class="bar-note">${fd.noShowImpact==="frequently"?"Frequent no-shows = "+f(m.noShowCost)+"/month direct loss. Automated reminders cut rates by 40–70%.":"Automated reminders keep this near zero at negligible cost."}</div>
    </div>
  </div>

  <!-- AI ANALYSIS -->
  ${aiReport ? `
  <div class="sec-overline">AI Diagnosis</div>
  <div class="ai-card">
    <div class="ai-header">
      <div class="ai-icon">◈</div>
      <div>
        <div class="ai-title-text">AI Growth Analysis — ${bizLabel}</div>
        <div class="ai-subtitle">Powered by Estate Flow AI · Built from your specific answers</div>
      </div>
    </div>
    <div class="ai-body">${aiReport.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
  </div>
  ` : ""}

  <!-- OPPORTUNITIES -->
  <div class="sec-overline">Action Plan</div>
  <div class="sec-title">AI Automation Opportunities — Ranked by ROI</div>
  ${oppCards.map(o => `
  <div class="opp-card" style="border-color:${priorityBorder(o.priority)};background:${priorityBg(o.priority)};">
    <div class="opp-badge" style="color:${priorityColor(o.priority)};background:#FFFFFF;border-color:${priorityColor(o.priority)}40;">${o.priority}</div>
    <div>
      <div class="opp-title">${o.title}</div>
      <div class="opp-body">${o.body}</div>
    </div>
  </div>`).join("")}

  <!-- GROWTH POTENTIAL -->
  <div class="divider"></div>
  <div class="growth-card">
    <div class="sec-overline" style="margin-bottom:8px;">Growth Potential</div>
    <div class="growth-num">${f(m.totalAnnualLeak)}</div>
    <div class="growth-label">recoverable annual revenue</div>
    <div class="growth-body">
      Fixing your lead response, follow-up, after-hours, and admin gaps could recover <strong>${f(m.totalMonthlyLeak)}/month</strong> — or <strong>${f(m.totalAnnualLeak)} per year</strong> — without spending a single extra ${s} on advertising.
      ${fd.growthGoals && fd.growthGoals.length > 10 ? `<br/><br/>Your stated goal: <strong>"${fd.growthGoals.slice(0,140)}${fd.growthGoals.length>140?"…":""}"</strong> — achievable through the roadmap above.` : ""}
    </div>
  </div>

  <!-- CTA -->
  <div class="cta-card">
    <div class="cta-overline">Exclusive Strategy Session</div>
    <div class="cta-heading">Ready to recover ${f(m.totalMonthlyLeak)}/month?</div>
    <div class="cta-body">Book a free 30-minute strategy call. Our team will walk through exactly how to implement these AI systems for your ${bizLabel} business — with a clear 30-day deployment plan.</div>
    <a href="https://calendly.com/charanrathod-inf/30min" class="cta-url" style="background:#C8A96E;color:#FFFFFF;border-radius:999px;display:inline-block;padding:13px 24px;text-decoration:none;font-weight:800;">Book Your Free Strategy Call →</a>
    <div class="cta-trust">
      <span>📅 30-Min Confidential Session</span>
      <span>🔒 100% Secure &amp; Private</span>
      <span>✓ No Commitment Required</span>
    </div>
  </div>

</div><!-- /content -->

<!-- FOOTER -->
<div class="footer">
  <span class="footer-text">© ${new Date().getFullYear()} Estate Flow AI · Confidential Business Report</span>
  <span class="footer-mono">estateflowai.com</span>
</div>

</div><!-- /page -->
</body>
</html>`;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { lead, formData, aiReport, score, currency, sym, createdAt } = body;
    const html = buildPDFHTML({ lead, formData, aiReport, score, currency, sym, createdAt });
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Audit-PDF": "true",
      },
    });
  } catch (err) {
    console.error("generate-pdf error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
