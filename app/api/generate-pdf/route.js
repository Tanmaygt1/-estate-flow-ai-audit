// app/api/generate-pdf/route.js
// Generates a clean, properly structured PDF from audit data
// Uses @sparticuz/chromium + puppeteer-core for server-side rendering

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

const REV_MID = { tier1:5000, tier2:25000, tier3:120000, tier4:350000 };

function calcScore(d){
  let score=100;
  const followUp=Array.isArray(d.followUpMethod)?d.followUpMethod:[];
  const adminHrMap={"0-5hrs":2.5,"5-10hrs":7.5,"10-20hrs":15,"20+hrs":25};
  const weeklyAdminHrs=adminHrMap[d.adminHours]||7.5;
  const monthlyAdminHrs=Math.round(weeklyAdminHrs*4.33);
  const revMid=REV_MID[d.revTier]||25000;
  const teamN={"1-5":3,"6-15":10,"16-50":30,"50+":60}[d.teamSize]||5;
  const respPenalty=d.responseSpeed==="longer"?0.35:d.responseSpeed==="within-24hr"?0.20:d.responseSpeed==="within-1hr"?0.08:0;
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
  score=Math.max(8,Math.min(100,score));
  const hourlyRate=Math.round(revMid/160/teamN*2);
  const adminWasteCost=Math.round(monthlyAdminHrs*hourlyRate);
  const conversionLoss=Math.round(revMid*respPenalty*0.3);
  const afterHoursMiss=(d.outOfHours==="next-day"||d.outOfHours==="no-process-oos")?Math.round(revMid*0.12):0;
  const followUpLoss=followUp.includes("no-follow-up")?Math.round(revMid*0.20):Math.round(revMid*0.08);
  const noShowCost=d.noShowImpact==="frequently"?Math.round(revMid*0.08):d.noShowImpact==="occasionally"?Math.round(revMid*0.04):0;
  const totalMonthlyLeak=conversionLoss+afterHoursMiss+followUpLoss+adminWasteCost+noShowCost;
  return{ score,weeklyAdminHrs,monthlyAdminHrs,adminWasteCost,conversionLoss,afterHoursMiss,followUpLoss,noShowCost,totalMonthlyLeak,totalAnnualLeak:totalMonthlyLeak*12,followUp };
}

function fmt(n, sym="£"){
  const v=Math.round(Number(n));
  if(sym==="₹") return "₹"+v.toLocaleString("en-IN");
  return sym+v.toLocaleString("en-GB");
}

function buildPDFHTML({ lead, formData, aiReport, score, currency, sym, createdAt }) {
  const fd = formData || {};
  const m = calcScore(fd);
  const bizLabel = INDUSTRY_LABELS[fd.industry] || "Business";
  const date = new Date(createdAt || Date.now()).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
  const scoreColor = score >= 68 ? "#10b981" : score >= 42 ? "#f59e0b" : "#ef4444";
  const scoreLabel = score >= 68 ? "Moderate" : score >= 42 ? "At Risk" : "Critical";
  const f = (n) => fmt(n, sym || "£");

  const REGION_LABELS = {
    uk:"United Kingdom",usa:"United States",europe:"Europe",
    india:"India",uae:"UAE / Gulf",australia:"Australia",
    canada:"Canada",singapore:"Singapore",other:"Global",
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Estate Flow AI — Growth Audit Report</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Plus Jakarta Sans',sans-serif;background:#FAFAF8;color:#1a1a2e;-webkit-font-smoothing:antialiased;font-size:14px;line-height:1.6;}
  .page{max-width:794px;margin:0 auto;padding:0;}

  /* Header */
  .header{background:#0D0F1A;padding:36px 48px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px;}
  .header-logo{display:flex;align-items:center;gap:10px;}
  .logo-mark{width:38px;height:38px;border-radius:9px;background:linear-gradient(135deg,#C8A96E,#E8C98E);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#04050A;font-family:'Plus Jakarta Sans',sans-serif;}
  .logo-text{font-size:18px;font-weight:700;color:#F5F2EC;letter-spacing:-0.02em;}
  .logo-text span{color:#C8A96E;}
  .header-meta{text-align:right;}
  .header-meta-label{font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#4A4438;margin-bottom:4px;}
  .header-meta-date{font-size:13px;color:#9A9282;}

  /* Title section */
  .title-section{background:#07080D;padding:40px 48px;border-bottom:1px solid rgba(200,169,110,0.15);}
  .audit-label{font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#C8A96E;margin-bottom:10px;}
  .audit-title{font-size:32px;font-weight:800;color:#F5F2EC;letter-spacing:-0.025em;line-height:1.2;margin-bottom:12px;}
  .audit-meta{font-size:14px;color:#9A9282;}
  .audit-meta strong{color:#F5F2EC;}

  /* Content */
  .content{background:#FAFAF8;padding:40px 48px;}

  /* Score section */
  .score-section{background:#fff;border:1px solid #E8E4DC;border-radius:14px;padding:32px;margin-bottom:24px;display:flex;gap:32px;align-items:center;}
  .score-gauge{text-align:center;flex-shrink:0;}
  .score-circle{width:100px;height:100px;border-radius:50%;border:6px solid #E8E4DC;display:flex;align-items:center;justify-content:center;position:relative;margin:0 auto 10px;}
  .score-num{font-size:28px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${scoreColor};}
  .score-denom{font-size:12px;color:#9A9282;}
  .score-badge{display:inline-block;padding:4px 14px;border-radius:100px;font-size:11px;font-weight:700;background:${scoreColor}18;color:${scoreColor};border:1px solid ${scoreColor}35;}
  .score-info{}
  .score-info-label{font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9A9282;margin-bottom:8px;}
  .score-info-heading{font-size:18px;font-weight:800;color:#1a1a2e;letter-spacing:-0.015em;margin-bottom:10px;line-height:1.3;}
  .score-info-body{font-size:13px;color:#6B6560;line-height:1.75;}
  .score-info-body strong{color:#1a1a2e;}

  /* Section header */
  .section-header{margin:32px 0 16px;}
  .section-label{font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#C8A96E;margin-bottom:6px;}
  .section-title{font-size:16px;font-weight:800;color:#1a1a2e;letter-spacing:-0.015em;}

  /* Stats grid */
  .stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;}
  .stat-card{background:#fff;border:1px solid #E8E4DC;border-radius:10px;padding:20px;}
  .stat-label{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9A9282;margin-bottom:6px;}
  .stat-value{font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace;margin-bottom:4px;}
  .stat-sub{font-size:11px;color:#9A9282;line-height:1.5;}
  .val-red{color:#ef4444;}
  .val-yellow{color:#f59e0b;}
  .val-green{color:#10b981;}

  /* Operations */
  .ops-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;}
  .ops-card{background:#fff;border:1px solid #E8E4DC;border-radius:10px;padding:18px;}
  .ops-label{font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9A9282;margin-bottom:5px;}
  .ops-value{font-size:20px;font-weight:800;font-family:'JetBrains Mono',monospace;}

  /* Bar */
  .bar-row{margin-bottom:16px;}
  .bar-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;}
  .bar-label{font-size:13px;color:#6B6560;}
  .bar-val{font-size:12px;font-family:'JetBrains Mono',monospace;font-weight:600;}
  .bar-track{height:5px;background:#F0EDE8;border-radius:4px;overflow:hidden;}
  .bar-fill{height:100%;border-radius:4px;}
  .bar-note{font-size:11px;color:#9A9282;margin-top:4px;line-height:1.5;}

  /* AI Analysis */
  .ai-section{background:#07080D;border-radius:14px;padding:32px;margin-bottom:24px;}
  .ai-header{display:flex;gap:12px;align-items:center;margin-bottom:16px;}
  .ai-icon{width:36px;height:36px;border-radius:9px;background:rgba(200,169,110,0.15);border:1px solid rgba(200,169,110,0.25);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
  .ai-title{font-size:14px;font-weight:700;color:#F5F2EC;}
  .ai-subtitle{font-size:11px;color:#9A9282;}
  .ai-body{font-size:13px;color:#9A9282;line-height:1.9;white-space:pre-wrap;}

  /* Opportunities */
  .opp-card{background:#fff;border:1px solid #E8E4DC;border-radius:10px;padding:18px;margin-bottom:10px;display:flex;gap:14px;align-items:flex-start;}
  .opp-badge{padding:3px 10px;border-radius:100px;font-size:10px;font-weight:700;flex-shrink:0;margin-top:1px;}
  .badge-critical{background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2);}
  .badge-high{background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.2);}
  .badge-medium{background:rgba(200,169,110,0.1);color:#C8A96E;border:1px solid rgba(200,169,110,0.2);}
  .opp-title{font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:5px;}
  .opp-body{font-size:12px;color:#6B6560;line-height:1.65;}

  /* Growth potential */
  .growth-section{background:linear-gradient(135deg,rgba(200,169,110,0.06),rgba(200,169,110,0.02));border:1px solid rgba(200,169,110,0.2);border-radius:14px;padding:28px;margin-bottom:24px;}
  .growth-num{font-size:40px;font-weight:800;color:#10b981;font-family:'JetBrains Mono',monospace;margin-bottom:4px;}
  .growth-label{font-size:13px;color:#9A9282;margin-bottom:12px;}
  .growth-body{font-size:13px;color:#6B6560;line-height:1.8;}
  .growth-body strong{color:#1a1a2e;}

  /* CTA */
  .cta-section{background:#07080D;border-radius:14px;padding:40px 32px;text-align:center;border:1px solid rgba(200,169,110,0.25);}
  .cta-label{font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#C8A96E;margin-bottom:16px;}
  .cta-heading{font-size:24px;font-weight:800;color:#F5F2EC;letter-spacing:-0.02em;margin-bottom:12px;line-height:1.3;}
  .cta-body{font-size:14px;color:rgba(250,248,244,0.5);margin-bottom:24px;line-height:1.75;}
  .cta-url{display:inline-block;padding:14px 36px;border-radius:10px;background:linear-gradient(135deg,#C8A96E,#E8C98E);color:#04050A;font-weight:800;font-size:15px;text-decoration:none;letter-spacing:0.01em;}
  .cta-trust{display:flex;justify-content:center;gap:20px;margin-top:16px;flex-wrap:wrap;}
  .cta-trust span{font-size:11px;color:rgba(200,169,110,0.45);}

  /* Footer */
  .footer{background:#0D0F1A;padding:20px 48px;display:flex;align-items:center;justify-content:space-between;}
  .footer-text{font-size:11px;color:#4A4438;}
  .footer-page{font-size:11px;color:#4A4438;font-family:'JetBrains Mono',monospace;}

  /* Divider */
  .divider{height:1px;background:#E8E4DC;margin:24px 0;}

  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-logo">
      <div class="logo-mark">EF</div>
      <span class="logo-text">Estate Flow<span> AI</span></span>
    </div>
    <div class="header-meta">
      <div class="header-meta-label">AI Growth Audit Report</div>
      <div class="header-meta-date">${date}</div>
    </div>
  </div>

  <!-- TITLE -->
  <div class="title-section">
    <div class="audit-label">Personalised Business Diagnostic</div>
    <div class="audit-title">Your AI Growth<br/>Audit Report</div>
    <div class="audit-meta">
      <strong>${bizLabel}</strong> &nbsp;·&nbsp; ${fd.teamSize || "—"} team &nbsp;·&nbsp; Revenue: ${fd.revTier || "—"} &nbsp;·&nbsp; ${REGION_LABELS[fd.region] || fd.region || "—"}
      ${lead?.name ? `<br/><strong style="color:#C8A96E">${lead.name}</strong>${lead.company ? ` · ${lead.company}` : ""}${lead.email ? ` · ${lead.email}` : ""}` : ""}
    </div>
  </div>

  <!-- CONTENT -->
  <div class="content">

    <!-- AI GROWTH SCORE -->
    <div class="score-section">
      <div class="score-gauge">
        <div class="score-circle" style="border-color:${scoreColor};">
          <div>
            <div class="score-num">${score}</div>
            <div class="score-denom">/100</div>
          </div>
        </div>
        <div class="score-badge">${scoreLabel}</div>
      </div>
      <div class="score-info">
        <div class="score-info-label">AI Growth Score</div>
        <div class="score-info-heading">
          ${score < 42 ? "Critical gaps — significant revenue being left on the table" : score < 68 ? "Several AI opportunities — clear room to grow" : "Good foundation — targeted AI unlocks the next level"}
        </div>
        <div class="score-info-body">
          Top businesses score <strong>75+</strong>. Your score of <strong style="color:${scoreColor}">${score}/100</strong>
          ${score < 42 ? " reveals multiple compounding problems actively costing you revenue every day." : score < 68 ? " shows clear gaps in lead handling, operations, and customer experience." : " shows a solid base with specific automation opportunities ready to unlock growth."}
        </div>
      </div>
    </div>

    <!-- REVENUE LEAK -->
    <div class="section-header">
      <div class="section-label">Financial Impact</div>
      <div class="section-title">Revenue Leak — Where Money Is Escaping</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Monthly Leak</div>
        <div class="stat-value val-red">${f(m.totalMonthlyLeak)}</div>
        <div class="stat-sub">Across response, follow-up, admin &amp; no-shows</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Annual Revenue at Risk</div>
        <div class="stat-value val-red">${f(m.totalAnnualLeak)}</div>
        <div class="stat-sub">If gaps remain unfixed over 12 months</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Response Speed Loss</div>
        <div class="stat-value val-yellow">${f(m.conversionLoss)}</div>
        <div class="stat-sub">From ${fd.responseSpeed || "—"} response time</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Follow-Up Leakage</div>
        <div class="stat-value val-yellow">${f(m.followUpLoss)}</div>
        <div class="stat-sub">Leads lost to inconsistent follow-up</div>
      </div>
    </div>

    <!-- OPERATIONS -->
    <div class="section-header">
      <div class="section-label">Operations & Efficiency</div>
      <div class="section-title">Time & Cost Breakdown</div>
    </div>
    <div class="ops-grid">
      <div class="ops-card">
        <div class="ops-label">Weekly admin hours wasted</div>
        <div class="ops-value val-yellow">${m.weeklyAdminHrs} hrs</div>
        <div class="stat-sub" style="margin-top:4px">Team of ${fd.teamSize || "—"}</div>
      </div>
      <div class="ops-card">
        <div class="ops-label">Monthly cost of overhead</div>
        <div class="ops-value val-red">${f(m.adminWasteCost)}</div>
        <div class="stat-sub" style="margin-top:4px">Estimated labour cost</div>
      </div>
    </div>

    <div style="background:#fff;border:1px solid #E8E4DC;border-radius:10px;padding:20px;margin-bottom:24px;">
      <div class="bar-row">
        <div class="bar-header">
          <span class="bar-label">Lead response speed</span>
          <span class="bar-val" style="color:${fd.responseSpeed==="instantly"?"#10b981":fd.responseSpeed==="within-24hr"?"#f59e0b":"#ef4444"}">${fd.responseSpeed==="instantly"?"Optimal":fd.responseSpeed==="within-1hr"?"Good":fd.responseSpeed==="within-24hr"?"Slow":"Critical"}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${fd.responseSpeed==="instantly"?100:fd.responseSpeed==="within-1hr"?72:fd.responseSpeed==="within-24hr"?38:12}%;background:${fd.responseSpeed==="instantly"?"#10b981":fd.responseSpeed==="within-1hr"?"#10b981":fd.responseSpeed==="within-24hr"?"#f59e0b":"#ef4444"};"></div></div>
        <div class="bar-note">${fd.responseSpeed==="longer"?"Over 24 hours — highest-impact fix. AI response eliminates this entirely.":fd.responseSpeed==="within-24hr"?"24 hours loses motivated leads. AI in under 2 minutes recovers most of this.":fd.responseSpeed==="within-1hr"?"Good — AI can push this to under 2 min 24/7.":"Optimal — AI ensures this scales without adding headcount."}</div>
      </div>
      <div class="bar-row">
        <div class="bar-header">
          <span class="bar-label">After-hours coverage</span>
          <span class="bar-val" style="color:${fd.outOfHours==="automation-oos"?"#10b981":"#ef4444"}">${fd.outOfHours==="automation-oos"?"Automated":fd.outOfHours==="manual-oos"?"Manual":fd.outOfHours==="next-day"?"Next day":"No process"}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${fd.outOfHours==="automation-oos"?100:fd.outOfHours==="manual-oos"?60:fd.outOfHours==="next-day"?25:5}%;background:${fd.outOfHours==="automation-oos"?"#10b981":fd.outOfHours==="manual-oos"?"#f59e0b":"#ef4444"};"></div></div>
        <div class="bar-note">Missing after-hours enquiries is a continuous, silent revenue drain.</div>
      </div>
      <div class="bar-row" style="margin-bottom:0;">
        <div class="bar-header">
          <span class="bar-label">Admin overhead intensity</span>
          <span class="bar-val" style="color:${fd.adminHours==="0-5hrs"?"#10b981":fd.adminHours==="5-10hrs"?"#f59e0b":"#ef4444"}">${fd.adminHours || "—"}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${fd.adminHours==="0-5hrs"?15:fd.adminHours==="5-10hrs"?40:fd.adminHours==="10-20hrs"?70:95}%;background:${fd.adminHours==="0-5hrs"?"#10b981":fd.adminHours==="5-10hrs"?"#f59e0b":"#ef4444"};"></div></div>
        <div class="bar-note">${m.monthlyAdminHrs} hours/month = ${f(m.adminWasteCost)} in labour that AI automation can largely eliminate.</div>
      </div>
    </div>

    <!-- AI ANALYSIS -->
    ${aiReport ? `
    <div class="ai-section">
      <div class="ai-header">
        <div class="ai-icon">◈</div>
        <div>
          <div class="ai-title">AI Growth Analysis — ${bizLabel}</div>
          <div class="ai-subtitle">Powered by Estate Flow AI · Generated from your specific answers</div>
        </div>
      </div>
      <div class="ai-body">${aiReport.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
    </div>
    ` : ""}

    <!-- OPPORTUNITIES -->
    <div class="section-header">
      <div class="section-label">Action Plan</div>
      <div class="section-title">AI Automation Opportunities — Ranked by ROI</div>
    </div>

    <div class="opp-card">
      <span class="opp-badge ${fd.responseSpeed==="longer"?"badge-critical":"badge-high"}">${fd.responseSpeed==="longer"?"CRITICAL":"HIGH"}</span>
      <div>
        <div class="opp-title">${fd.responseSpeed==="longer"||fd.responseSpeed==="within-24hr"?"AI Lead Response System — 24/7 Instant Engagement":"Intelligent Lead Qualification & Routing"}</div>
        <div class="opp-body">${fd.responseSpeed==="longer"?`Your response time triggers an estimated ${f(m.conversionLoss)}/month in lost conversions. An AI system responding in under 2 minutes — day and night — recovers the majority before leads contact a competitor.`:`AI routing ensures every lead reaches the right person instantly, improving close rate without increasing team size.`}</div>
      </div>
    </div>

    <div class="opp-card">
      <span class="opp-badge ${m.followUp.includes("no-follow-up")?"badge-critical":"badge-high"}">${m.followUp.includes("no-follow-up")?"CRITICAL":"HIGH"}</span>
      <div>
        <div class="opp-title">${m.followUp.includes("no-follow-up")?"Automated Follow-Up Sequences — Stop Losing Warm Leads":"Multi-Channel Follow-Up Automation"}</div>
        <div class="opp-body">${m.followUp.includes("no-follow-up")?`No structured follow-up means walking away after first contact. 80% of sales require 5+ touchpoints. Automated sequences could recover ${f(m.followUpLoss)}/month.`:`Your current follow-up (${m.followUp.join(", ")}) is largely manual. Automating with behaviour-triggered sequences typically recovers 20–35% more conversions from the same lead volume.`}</div>
      </div>
    </div>

    <div class="opp-card">
      <span class="opp-badge ${fd.outOfHours==="no-process-oos"||fd.outOfHours==="next-day"?"badge-high":"badge-medium"}">${fd.outOfHours==="no-process-oos"||fd.outOfHours==="next-day"?"HIGH":"MEDIUM"}</span>
      <div>
        <div class="opp-title">${fd.outOfHours==="no-process-oos"||fd.outOfHours==="next-day"?"After-Hours AI — Capture Enquiries While You Sleep":"After-Hours Optimisation"}</div>
        <div class="opp-body">${fd.outOfHours==="no-process-oos"||fd.outOfHours==="next-day"?`No after-hours process means invisible at peak motivation moments. Estimated ${f(m.afterHoursMiss)}/month slipping away. An AI assistant covers these windows automatically.`:`Full automation — AI that qualifies, books, and responds without human involvement — increases off-peak conversion by 30–50%.`}</div>
      </div>
    </div>

    <div class="opp-card">
      <span class="opp-badge ${fd.adminHours==="20+hrs"?"badge-critical":fd.adminHours==="10-20hrs"?"badge-high":"badge-medium"}">${fd.adminHours==="20+hrs"?"CRITICAL":fd.adminHours==="10-20hrs"?"HIGH":"MEDIUM"}</span>
      <div>
        <div class="opp-title">Workflow Automation — Reclaim ${m.weeklyAdminHrs} Hours/Week</div>
        <div class="opp-body">Your team spends ~${m.monthlyAdminHrs} hours/month on repetitive admin — worth ${f(m.adminWasteCost)}/month in labour. AI workflow automation (scheduling, reporting, data entry) eliminates 60–70% of this within 60 days.</div>
      </div>
    </div>

    <!-- GROWTH POTENTIAL -->
    <div class="growth-section">
      <div class="section-label" style="margin-bottom:10px;">Growth Potential</div>
      <div class="growth-num">${f(m.totalAnnualLeak)}</div>
      <div class="growth-label">recoverable annual revenue</div>
      <div class="growth-body">
        Fixing your lead response, follow-up, after-hours, and admin gaps could recover <strong>${f(m.totalMonthlyLeak)}/month</strong> — or <strong>${f(m.totalAnnualLeak)} per year</strong> — without spending a single extra pound on advertising.
        ${fd.growthGoals && fd.growthGoals.length > 10 ? `<br/><br/>Your stated goal: <strong>"${fd.growthGoals.slice(0,120)}${fd.growthGoals.length>120?"…":""}"</strong> — achievable through the roadmap above.` : ""}
      </div>
    </div>

    <!-- CTA -->
    <div class="cta-section">
      <div class="cta-label">Exclusive Strategy Session</div>
      <div class="cta-heading">Ready to recover ${f(m.totalMonthlyLeak)}/month?</div>
      <div class="cta-body">Book a free 30-minute strategy call. Our team will walk through exactly how to implement the AI systems above for your ${bizLabel} business — with a clear 30-day deployment plan.</div>
      <a href="https://calendly.com/charanrathod-inf/30min" class="cta-url">Book Your Free Strategy Call →</a>
      <div class="cta-trust">
        <span>📅 30-Min Confidential Session</span>
        <span>🔒 100% Secure & Private</span>
        <span>✓ No Commitment Required</span>
      </div>
    </div>

  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span class="footer-text">© ${new Date().getFullYear()} Estate Flow AI · Confidential</span>
    <span class="footer-page">estateflowai.com</span>
  </div>

</div>
</body>
</html>`;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { lead, formData, aiReport, score, currency, sym, createdAt } = body;

    const html = buildPDFHTML({ lead, formData, aiReport, score, currency, sym, createdAt });

    // Return the HTML — client will open it and trigger print/save
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
