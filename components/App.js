"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ─── Region → Currency ────────────────────────────────────────────────────────
const REGIONS = [
  { val:"uk",        label:"🇬🇧 United Kingdom",    currency:"GBP", sym:"£" },
  { val:"usa",       label:"🇺🇸 United States",      currency:"USD", sym:"$" },
  { val:"europe",    label:"🇪🇺 Europe",              currency:"EUR", sym:"€" },
  { val:"india",     label:"🇮🇳 India",               currency:"INR", sym:"₹" },
  { val:"uae",       label:"🇦🇪 UAE / Gulf",          currency:"AED", sym:"AED " },
  { val:"australia", label:"🇦🇺 Australia / NZ",      currency:"AUD", sym:"A$" },
  { val:"canada",    label:"🇨🇦 Canada",              currency:"CAD", sym:"C$" },
  { val:"singapore", label:"🇸🇬 Singapore / SE Asia", currency:"SGD", sym:"S$" },
  { val:"other",     label:"🌍 Other",                currency:"USD", sym:"$" },
];
const REV_MID = { tier1:5000, tier2:25000, tier3:120000, tier4:350000 };
function getRegion(val){ return REGIONS.find(r=>r.val===val)||REGIONS[0]; }
function makeFmt(sym){
  return(n)=>{
    const v=Math.round(Number(n));
    if(sym==="₹") return "₹"+v.toLocaleString("en-IN");
    return sym+v.toLocaleString("en-GB");
  };
}

// ─── Score Engine ─────────────────────────────────────────────────────────────
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
  const totalAnnualLeak=totalMonthlyLeak*12;
  return{ score,weeklyAdminHrs,monthlyAdminHrs,teamN,hourlyRate,adminWasteCost,conversionLoss,afterHoursMiss,followUpLoss,noShowCost,totalMonthlyLeak,totalAnnualLeak,respPenalty,followUp,revMid };
}

const INDUSTRY_LABELS={
  "real-estate-sales":"Real Estate","real-estate-dev":"Real Estate Dev","property-mgmt":"Property Management",
  "agency":"Agency","consulting":"Consulting","legal":"Legal / Finance","recruitment":"Recruitment",
  "coaching":"Coaching","clinic":"Clinic","wellness":"Wellness","retail":"Retail","ecommerce":"E-commerce",
  "restaurant":"Restaurant","saas":"SaaS","app":"App / Platform","media":"Media",
  "logistics":"Logistics","manufacturing":"Manufacturing","hospitality":"Hospitality","other":"Business",
};

// ─── CSS (injected client-side to avoid SSR hydration mismatch) ───────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --serif:'Instrument Serif',serif;--sans:'Plus Jakarta Sans',sans-serif;--mono:'JetBrains Mono',monospace;
  --ink:#07080D;--gold:#C8A96E;--gold2:#E8C98E;--gold-dim:rgba(200,169,110,0.10);--gold-glow:rgba(200,169,110,0.22);
  --white:#FFFFFF;--warm-white:#FAF8F4;--t1:#F5F2EC;--t2:#9A9282;--t3:#4A4438;
  --surface:rgba(255,255,255,0.03);--glass-border:rgba(255,255,255,0.09);
  --green:#10b981;--red:#ef4444;--yellow:#f59e0b;--r:12px;
}
html,body{height:100%;}
body{font-family:var(--sans);color:var(--t1);-webkit-font-smoothing:antialiased;min-height:100vh;overflow-x:hidden;background:var(--ink);}
::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(200,169,110,0.3);border-radius:4px;}
.bg-fixed{position:fixed;inset:0;z-index:-2;background-image:url('https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2070');background-size:cover;background-position:center;filter:brightness(0.18) saturate(0.4) contrast(1.25);transform:scale(1.04);}
.bg-overlay{position:fixed;inset:0;z-index:-1;background:radial-gradient(circle at 50% 35%,rgba(200,169,110,0.06) 0%,rgba(5,6,12,0.95) 65%);backdrop-filter:blur(2px);}
.bg-grain{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.035;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");background-repeat:repeat;background-size:128px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(22px);}to{opacity:1;transform:translateY(0);}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.3;}}
@keyframes goldPulse{0%,100%{border-color:rgba(200,169,110,0.32);}50%{border-color:rgba(200,169,110,0.72);box-shadow:0 0 40px rgba(200,169,110,0.12),0 40px 90px rgba(0,0,0,0.85);}}
@keyframes countUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
.anim{animation:fadeUp 0.55s cubic-bezier(0.16,1,0.3,1) both;}
.d1{animation-delay:.08s;}.d2{animation-delay:.16s;}.d3{animation-delay:.24s;}.d4{animation-delay:.32s;}.d5{animation-delay:.4s;}
.card{background:var(--surface);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border:1px solid var(--glass-border);box-shadow:0 30px 60px -15px rgba(0,0,0,0.65),inset 0 1px 0 0 rgba(255,255,255,0.08);border-radius:var(--r);padding:24px;}
.card-accent{background:linear-gradient(135deg,rgba(200,169,110,0.07) 0%,rgba(200,169,110,0.03) 100%);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border:1px solid rgba(200,169,110,0.18);box-shadow:0 30px 60px -15px rgba(0,0,0,0.65),inset 0 1px 0 0 rgba(255,255,255,0.06);border-radius:var(--r);padding:24px;}
.card-glow{background:var(--surface);backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);border:1px solid rgba(200,169,110,0.22);box-shadow:0 0 0 1px rgba(200,169,110,0.07),0 30px 70px -15px rgba(0,0,0,0.7),inset 0 1px 0 0 rgba(255,255,255,0.1);border-radius:var(--r);padding:24px;}
.card-obsidian{background:#04050A;border:2px solid rgba(200,169,110,0.38);border-radius:20px;padding:48px 36px;text-align:center;position:relative;overflow:hidden;animation:goldPulse 3s ease infinite;box-shadow:0 40px 90px rgba(0,0,0,0.85);}
.card-obsidian::before{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:70%;height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.55),transparent);}
h1,h2{font-family:var(--serif);font-style:italic;font-weight:400;letter-spacing:-0.02em;line-height:1.15;text-shadow:0 2px 14px rgba(0,0,0,0.5);}
h3,h4{font-family:var(--sans);font-weight:700;letter-spacing:-0.02em;}
p{font-family:var(--sans);line-height:1.8;letter-spacing:0.015em;}
.slabel{font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:var(--t3);margin-bottom:12px;font-family:var(--sans);}
.fl{display:block;font-size:12px;font-weight:700;color:var(--t2);margin-bottom:8px;letter-spacing:0.1em;text-transform:uppercase;font-family:var(--sans);}
.fh{font-size:12px;color:var(--t3);margin-top:5px;line-height:1.6;letter-spacing:0.01em;}
.mono{font-family:var(--mono);letter-spacing:-0.03em;}
input[type=number],input[type=text],textarea,select{width:100%;background:rgba(255,255,255,0.04);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.09);border-radius:8px;color:var(--t1);padding:12px 16px;font-size:14px;font-family:var(--sans);letter-spacing:0.01em;transition:border-color .2s,box-shadow .2s,background .2s;appearance:none;-webkit-appearance:none;}
textarea{resize:vertical;min-height:90px;line-height:1.65;}
input:focus,select:focus,textarea:focus{outline:none;border-color:rgba(200,169,110,0.55);box-shadow:0 0 0 3px rgba(200,169,110,0.1),inset 0 1px 0 rgba(255,255,255,0.05);background:rgba(200,169,110,0.04);}
input::placeholder,textarea::placeholder{color:var(--t3);}
select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' viewBox='0 0 12 7'%3E%3Cpath fill='none' stroke='%239A9282' stroke-width='1.5' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:36px;}
select option{background:#0d0f1a;}
.choice-grid{display:flex;flex-wrap:wrap;gap:8px;}
.cb{background:rgba(255,255,255,0.025);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px 16px;font-size:13px;color:var(--t3);cursor:pointer;transition:all .2s cubic-bezier(0.16,1,0.3,1);font-family:var(--sans);letter-spacing:0.01em;text-align:left;}
.cb:hover{border-color:rgba(200,169,110,0.3);color:var(--t2);background:rgba(200,169,110,0.05);}
.cb.sel{border-color:rgba(200,169,110,0.6);color:var(--gold2);background:var(--gold-dim);box-shadow:0 0 0 1px rgba(200,169,110,0.15),inset 0 1px 0 rgba(255,255,255,0.06);}
.cb.sel::before{content:'✓ ';color:var(--gold);font-weight:700;}
.multi-hint{font-size:11px;color:var(--t3);margin-bottom:8px;display:flex;align-items:center;gap:5px;font-family:var(--sans);}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--sans);transition:all 0.22s cubic-bezier(0.16,1,0.3,1);border:none;letter-spacing:0.01em;white-space:nowrap;}
.bp{background:var(--gold);color:#04050A;box-shadow:0 0 0 1px rgba(200,169,110,0.4),0 4px 20px rgba(200,169,110,0.2);}
.bp:hover{background:var(--gold2);transform:translateY(-1px);box-shadow:0 0 0 1px rgba(200,169,110,0.5),0 8px 28px rgba(200,169,110,0.3);}
.bp:disabled{background:rgba(255,255,255,0.06);color:var(--t3);cursor:not-allowed;transform:none;box-shadow:none;}
.bo{background:rgba(255,255,255,0.04);backdrop-filter:blur(8px);color:var(--t2);border:1px solid rgba(255,255,255,0.1);}
.bo:hover{border-color:rgba(200,169,110,0.4);color:var(--gold2);}
.bcta{background:var(--gold);color:#04050A;font-family:var(--sans);font-size:16px;padding:16px 40px;box-shadow:0 0 0 1px rgba(200,169,110,0.4),0 6px 30px rgba(200,169,110,0.22);font-weight:700;letter-spacing:0.02em;border-radius:12px;}
.bcta:hover{background:var(--gold2);transform:translateY(-2px);box-shadow:0 0 0 1px rgba(200,169,110,0.5),0 12px 40px rgba(200,169,110,0.32);}
.btn-gold{background:linear-gradient(135deg,#C8A96E,#E8C98E);color:#04050A;font-family:var(--sans);font-size:17px;padding:18px 44px;font-weight:800;letter-spacing:0.02em;border-radius:12px;box-shadow:0 6px 40px rgba(200,169,110,0.32);transition:all .25s cubic-bezier(0.16,1,0.3,1);}
.btn-gold:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 12px 50px rgba(200,169,110,0.48);}
.field{margin-bottom:22px;}
.note{background:rgba(200,169,110,0.07);border-left:2px solid var(--gold);border-radius:0 8px 8px 0;padding:10px 14px;font-size:13px;color:var(--gold2);margin-top:8px;line-height:1.6;font-family:var(--sans);}
.warn{background:rgba(239,68,68,0.07);border-left:2px solid var(--red);border-radius:0 8px 8px 0;padding:10px 14px;font-size:13px;color:#fca5a5;margin-top:8px;line-height:1.6;display:flex;align-items:flex-start;gap:9px;font-family:var(--sans);}
hr.div{border:none;border-top:1px solid rgba(255,255,255,0.07);margin:22px 0;}
.pill{display:inline-flex;align-items:center;gap:4px;padding:4px 11px;border-radius:100px;font-size:11px;font-weight:600;font-family:var(--sans);}
.pc{background:rgba(239,68,68,.1);color:#fca5a5;border:1px solid rgba(239,68,68,.2);}
.ph{background:rgba(245,158,11,.1);color:#fcd34d;border:1px solid rgba(245,158,11,.2);}
.pm{background:rgba(200,169,110,.1);color:var(--gold2);border:1px solid rgba(200,169,110,.2);}
.pg{background:rgba(16,185,129,.1);color:#6ee7b7;border:1px solid rgba(16,185,129,.2);}
.spinner{width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,0.1);border-top-color:var(--gold);animation:spin .7s linear infinite;flex-shrink:0;}
.nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(4,5,10,0.82);backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;padding:0 28px;height:62px;}
.nav-logo{display:flex;align-items:center;gap:10px;}
.nav-logo-mark{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#C8A96E,#E8C98E);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#04050A;font-family:var(--sans);box-shadow:0 0 0 1px rgba(200,169,110,0.35),0 0 14px rgba(200,169,110,0.18);}
.nav-logo-text{font-size:16px;font-weight:700;color:var(--t1);font-family:var(--sans);letter-spacing:-0.02em;}
.nav-logo-text span{color:var(--gold);}
.progress-bar-track{height:2px;background:rgba(255,255,255,0.05);position:relative;overflow:hidden;}
.progress-bar-fill{height:100%;background:linear-gradient(90deg,var(--gold),var(--gold2));transition:width .6s cubic-bezier(0.16,1,0.3,1);position:relative;}
.progress-bar-fill::after{content:'';position:absolute;right:0;top:-1px;width:8px;height:4px;border-radius:2px;background:var(--gold2);box-shadow:0 0 8px var(--gold);}
.step-dots{display:flex;align-items:center;gap:0;padding:16px 28px 0;}
.step-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;transition:all .4s cubic-bezier(0.16,1,0.3,1);font-family:var(--sans);}
.step-line{flex:1;height:1px;background:rgba(255,255,255,0.07);transition:background .4s ease;}
.step-line.done{background:linear-gradient(90deg,var(--gold),var(--gold2));}
.bar-track{height:4px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;margin-top:6px;}
.bar-fill{height:100%;border-radius:4px;transition:width 1.5s cubic-bezier(0.16,1,0.3,1) 0.3s;}
.bar-fill.red{background:#EF4444;box-shadow:0 0 8px rgba(239,68,68,0.55);}
.bar-fill.yellow{background:#F59E0B;box-shadow:0 0 8px rgba(245,158,11,0.5);}
.bar-fill.green{background:#10B981;box-shadow:0 0 8px rgba(16,185,129,0.5);}
.risk-meter{position:relative;width:200px;height:100px;margin:0 auto;}
.risk-meter svg{width:100%;height:auto;}
.modal-backdrop{position:fixed;inset:0;background:rgba(4,5,10,0.9);backdrop-filter:blur(14px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .3s ease;}
.modal-box{width:100%;max-width:440px;animation:fadeUp .4s cubic-bezier(0.16,1,0.3,1);}
.history-card{padding:16px 20px;cursor:pointer;transition:all .2s ease;border-left:3px solid transparent;}
.history-card:hover{background:rgba(200,169,110,0.05);border-left-color:var(--gold);}
.pdf-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);color:var(--t2);font-family:var(--sans);transition:all .2s;letter-spacing:0.02em;}
.pdf-btn:hover{background:rgba(200,169,110,0.07);border-color:rgba(200,169,110,0.3);color:var(--gold2);}
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toggleMulti(data,field,val){const arr=Array.isArray(data[field])?data[field]:[];return arr.includes(val)?arr.filter(v=>v!==val):[...arr,val];}
function hasVal(data,field,val){return(Array.isArray(data[field])?data[field]:[]).includes(val);}

// ─── Shared components ────────────────────────────────────────────────────────
function CB({val,label,hint,field,data,upd}){
  return(
    <button className={`cb ${data[field]===val?"sel":""}`} onClick={()=>upd(field,val)}>
      {label}{hint&&<span style={{color:data[field]===val?"var(--gold)":"var(--t3)",marginLeft:5,fontSize:12}}>{hint}</span>}
    </button>
  );
}
function MCB({val,label,hint,field,data,upd}){
  const sel=hasVal(data,field,val);
  return(
    <button className={`cb ${sel?"sel":""}`} onClick={()=>upd(field,toggleMulti(data,field,val))}>
      <span style={{display:"inline-flex",alignItems:"center",gap:7}}>
        <span style={{width:14,height:14,borderRadius:3,flexShrink:0,display:"inline-flex",alignItems:"center",justifyContent:"center",border:`1.5px solid ${sel?"var(--gold)":"rgba(255,255,255,0.15)"}`,background:sel?"var(--gold)":"transparent",transition:"all .18s"}}>
          {sel&&<svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="#04050A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </span>
        {label}
      </span>
      {hint&&<span style={{color:sel?"var(--gold)":"var(--t3)",marginLeft:5,fontSize:12}}>{hint}</span>}
    </button>
  );
}
function WarnBox({children}){
  return(
    <div className="warn">
      <span style={{width:8,height:8,borderRadius:"50%",background:"var(--red)",marginTop:5,flexShrink:0,animation:"pulse 1.5s infinite"}}/>
      <span>{children}</span>
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav({user,onSignOut,onShowHistory,hasHistory}){
  return(
    <nav className="nav">
      <div className="nav-logo">
        <div className="nav-logo-mark">EF</div>
        <span className="nav-logo-text">Estate Flow<span> AI</span></span>
      </div>
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12}}>
        {user&&hasHistory&&(
          <button className="btn bo" style={{fontSize:12,padding:"6px 14px",gap:6}} onClick={onShowHistory}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
            Past Audits
          </button>
        )}
        {user&&(
          <>
            <span style={{fontSize:12,color:"var(--t3)",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</span>
            <button className="btn bo" style={{fontSize:12,padding:"6px 14px"}} onClick={onSignOut}>Sign out</button>
          </>
        )}
        {!user&&<div style={{fontSize:11,color:"var(--t3)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>AI Growth Audit</div>}
      </div>
    </nav>
  );
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────
function AuthModal({onClose,onSuccess,pendingFd}){
  const[mode,setMode]=useState("choose");
  const[form,setForm]=useState({name:"",email:"",phone:"",company:""});
  const[loading,setLoading]=useState(false);
  const[errors,setErrors]=useState({});
  const upd=(k,v)=>{setForm(p=>({...p,[k]:v}));setErrors(e=>({...e,[k]:""}));};

  const handleGoogle=async()=>{
    if(pendingFd) sessionStorage.setItem("audit_fd",JSON.stringify(pendingFd));
    const{error}=await supabase.auth.signInWithOAuth({
      provider:"google",
      options:{redirectTo:window.location.origin+"?audit=true"},
    });
    if(error) alert("Google sign-in failed. Try manually.");
  };

  const handleManual=async()=>{
    const errs={};
    if(!form.name.trim()) errs.name="Required";
    if(!form.email.trim()) errs.email="Required";
    else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email="Invalid email";
    if(Object.keys(errs).length){setErrors(errs);return;}
    setLoading(true);
    onSuccess({...form});
    setLoading(false);
  };

  return(
    <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal-box">
        <div className="card-glow" style={{padding:36}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{width:52,height:52,borderRadius:14,background:"rgba(200,169,110,0.1)",border:"1px solid rgba(200,169,110,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 16px"}}>🔒</div>
            <h2 style={{fontSize:"clamp(20px,3vw,24px)",marginBottom:8,color:"var(--t1)"}}>Your report is ready</h2>
            <p style={{fontSize:14,color:"var(--t2)",lineHeight:1.7,maxWidth:320,margin:"0 auto"}}>Sign in to unlock your personalised AI Growth Report — 10 seconds, completely free.</p>
          </div>

          {mode==="choose"&&(
            <>
              <button onClick={handleGoogle} style={{width:"100%",background:"#fff",color:"#1f2937",border:"none",borderRadius:10,padding:"14px 20px",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"var(--sans)",display:"flex",alignItems:"center",justifyContent:"center",gap:12,transition:"all .2s",marginBottom:12,boxShadow:"0 2px 12px rgba(0,0,0,0.4)"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.5)";}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,0.4)";}}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <div style={{flex:1,height:"1px",background:"rgba(255,255,255,0.07)"}}/><span style={{fontSize:11,color:"var(--t3)",fontWeight:600,letterSpacing:"0.08em"}}>OR</span><div style={{flex:1,height:"1px",background:"rgba(255,255,255,0.07)"}}/>
              </div>
              <button className="btn bo" style={{width:"100%",fontSize:13,padding:"11px"}} onClick={()=>setMode("manual")}>Enter details manually</button>
              <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:18,flexWrap:"wrap"}}>
                {["🔒 No spam","✓ Free forever","📧 Report emailed to you"].map((t,i)=>(<span key={i} style={{fontSize:11,color:"var(--t3)"}}>{t}</span>))}
              </div>
            </>
          )}

          {mode==="manual"&&(
            <>
              <button className="btn bo" style={{fontSize:12,padding:"6px 12px",marginBottom:20}} onClick={()=>setMode("choose")}>← Back</button>
              {[["name","Full Name","e.g. James Wilson",true],["email","Work Email","e.g. james@company.com",true],["company","Company","e.g. Wilson & Partners",false],["phone","Phone","e.g. +44 7700 900000",false]].map(([k,lbl,ph,req])=>(
                <div key={k} className="field">
                  <label className="fl">{lbl}{req?<span style={{color:"var(--red)",marginLeft:4}}>*</span>:<span style={{color:"var(--t3)",fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:11}}> — optional</span>}</label>
                  <input type="text" placeholder={ph} value={form[k]} onChange={e=>upd(k,e.target.value)} style={{borderColor:errors[k]?"var(--red)":undefined}}/>
                  {errors[k]&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>{errors[k]}</div>}
                </div>
              ))}
              <button className="btn bp" style={{width:"100%",padding:"13px"}} onClick={handleManual} disabled={loading}>
                {loading?"Saving…":"Unlock My Report →"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────
function Landing({onStart}){
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"110px 24px 60px",position:"relative"}}>
      <div style={{maxWidth:680,textAlign:"center",position:"relative",zIndex:1}}>
        <div className="anim" style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(200,169,110,0.08)",border:"1px solid rgba(200,169,110,0.22)",borderRadius:100,padding:"6px 18px",marginBottom:36}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:"var(--gold)",animation:"pulse 2s infinite",display:"inline-block"}}/>
          <span style={{fontSize:12,color:"var(--gold)",fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"var(--sans)"}}>Free · Any Business · Any Country · 3 Min</span>
        </div>
        <h1 className="anim d1" style={{fontSize:"clamp(36px,6vw,72px)",marginBottom:24,color:"var(--t1)"}}>
          Every business has blind spots.<br/>
          <span style={{background:"linear-gradient(90deg,var(--gold),var(--gold2))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
             Discover yours in minutes.
          </span>
        </h1>
        <p className="anim d2" style={{fontSize:18,color:"var(--t2)",maxWidth:520,margin:"0 auto 44px",lineHeight:1.8}}>
          Most businesses lose 40–60% of interested leads to slow responses, zero follow-up, and manual operations. Estate Flow AI finds exactly where — in 3 minutes.
        </p>
        <div className="anim d3" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
          <button className="btn bcta" onClick={onStart} style={{fontSize:17,padding:"17px 48px"}}>
            Start My Free AI Growth Audit
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          <p style={{fontSize:13,color:"var(--t3)",fontFamily:"var(--sans)",letterSpacing:"0.02em"}}>25 questions · Any business · Any country · Instant results</p>
        </div>
        <div className="anim d4" style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:8,marginTop:36}}>
          {["Real Estate","Agency","Clinic","Coaching","Restaurant","Retail","SaaS","E-commerce","Legal","Wellness","Hospitality","Finance"].map(i=>(
            <span key={i} style={{fontSize:11,color:"var(--t3)",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:100,padding:"4px 12px",fontFamily:"var(--sans)",letterSpacing:"0.03em"}}>{i}</span>
          ))}
        </div>
        <div className="anim d5" style={{display:"flex",gap:0,justifyContent:"center",marginTop:56,borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:40,flexWrap:"wrap"}}>
          {[["35–60%","Of revenue leaks from 3 fixable problems"],["80%","Of leads lost to slow follow-up"],["3 min","To get your full personalised AI roadmap"]].map(([n,d])=>(
            <div key={n} style={{flex:1,minWidth:150,textAlign:"center",padding:"0 20px"}}>
              <div style={{fontSize:30,fontWeight:700,color:"var(--t1)",fontFamily:"var(--serif)",fontStyle:"italic",marginBottom:6}}>{n}</div>
              <div style={{fontSize:12,color:"var(--t3)",lineHeight:1.6,fontFamily:"var(--sans)",letterSpacing:"0.02em"}}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step config ──────────────────────────────────────────────────────────────
const STEPS=[
  {title:"Business Snapshot",   sub:"Who you are and where you stand",               section:"1 of 5"},
  {title:"Leads & Sales",       sub:"How enquiries become paying customers",          section:"2 of 5"},
  {title:"Operations",          sub:"Where your team's time actually goes",           section:"3 of 5"},
  {title:"Customer Experience", sub:"What customers feel after they reach out",       section:"4 of 5"},
  {title:"AI Readiness",        sub:"Where you are with AI and where you want to go", section:"5 of 5"},
];

function ProgressHeader({step}){
  const pct=((step)/(STEPS.length-1))*100;
  return(
    <div style={{position:"sticky",top:62,zIndex:50,background:"rgba(4,5,10,0.85)",backdropFilter:"blur(16px)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
      <div className="progress-bar-track"><div className="progress-bar-fill" style={{width:`${Math.max(4,pct)}%`}}/></div>
      <div className="step-dots">
        {STEPS.map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",flex:i<STEPS.length-1?1:"none"}}>
            <div className="step-dot" style={{
              background:i<step?"var(--gold)":i===step?"rgba(200,169,110,0.15)":"rgba(255,255,255,0.04)",
              border:`${i===step?"2px":"1px"} solid ${i<step?"var(--gold)":i===step?"var(--gold)":"rgba(255,255,255,0.1)"}`,
              color:i<step?"#04050A":i===step?"var(--gold)":"var(--t3)",
              boxShadow:i===step?"0 0 0 4px rgba(200,169,110,0.12)":"none",
            }}>
              {i<step?<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#04050A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>:i+1}
            </div>
            {i<STEPS.length-1&&<div className={`step-line${i<step?" done":""}`}/>}
          </div>
        ))}
      </div>
      <div style={{padding:"8px 28px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",fontFamily:"var(--sans)"}}>{STEPS[step].title}</div>
        <div style={{fontSize:11,color:"var(--t3)",fontFamily:"var(--sans)",letterSpacing:"0.06em"}}>{STEPS[step].section}</div>
      </div>
    </div>
  );
}

// ─── Form Steps ───────────────────────────────────────────────────────────────
function Step0({d,u}){
  return(<>
    <div className="field">
      <label className="fl">1. What industry is your business in?</label>
      <select value={d.industry||""} onChange={e=>u("industry",e.target.value)}>
        <option value="">Select your industry</option>
        <optgroup label="Property & Real Estate"><option value="real-estate-sales">Real Estate — Sales / Lettings</option><option value="real-estate-dev">Real Estate — Development</option><option value="property-mgmt">Property Management</option></optgroup>
        <optgroup label="Professional Services"><option value="agency">Agency — Marketing / Design / Dev</option><option value="consulting">Consulting / Advisory</option><option value="legal">Legal / Accounting / Finance</option><option value="recruitment">Recruitment / HR</option><option value="coaching">Coaching / Training / Education</option></optgroup>
        <optgroup label="Healthcare & Wellness"><option value="clinic">Clinic / Healthcare</option><option value="wellness">Wellness / Fitness / Beauty</option></optgroup>
        <optgroup label="Retail & Food"><option value="retail">Retail — Physical Store</option><option value="ecommerce">E-commerce</option><option value="restaurant">Restaurant / Café / Food</option></optgroup>
        <optgroup label="Tech & Digital"><option value="saas">SaaS / Software</option><option value="app">App / Platform</option><option value="media">Media / Content / Creator</option></optgroup>
        <optgroup label="Other"><option value="logistics">Logistics / Transport</option><option value="manufacturing">Manufacturing</option><option value="hospitality">Hospitality / Travel</option><option value="other">Other</option></optgroup>
      </select>
    </div>
    <div className="field">
      <label className="fl">2. How many team members do you have?</label>
      <div className="choice-grid"><CB val="1-5" label="1–5" field="teamSize" data={d} upd={u}/><CB val="6-15" label="6–15" field="teamSize" data={d} upd={u}/><CB val="16-50" label="16–50" field="teamSize" data={d} upd={u}/><CB val="50+" label="50+" field="teamSize" data={d} upd={u}/></div>
    </div>
    <div className="field">
      <label className="fl">3. Where is your business based?</label>
      <p className="fh" style={{marginBottom:10}}>This sets your currency for all revenue figures in your report.</p>
      <div className="choice-grid">{REGIONS.map(r=>(<CB key={r.val} val={r.val} label={r.label} hint={`— ${r.sym}${r.currency}`} field="region" data={d} upd={u}/>))}</div>
      {d.region&&<div className="note">✓ Your report will show all figures in <strong>{getRegion(d.region).sym}{getRegion(d.region).currency}</strong>.</div>}
    </div>
    <div className="field">
      <label className="fl">4. What is your approximate monthly revenue?</label>
      <div className="choice-grid">
        <CB val="tier1" label={`Under ${d.region?getRegion(d.region).sym:""}10k`}  field="revTier" data={d} upd={u}/>
        <CB val="tier2" label={`${d.region?getRegion(d.region).sym:""}10k–50k`}    field="revTier" data={d} upd={u}/>
        <CB val="tier3" label={`${d.region?getRegion(d.region).sym:""}50k–250k`}   field="revTier" data={d} upd={u}/>
        <CB val="tier4" label={`${d.region?getRegion(d.region).sym:""}250k+`}      field="revTier" data={d} upd={u}/>
      </div>
    </div>
    <div className="field">
      <label className="fl">5. What is your biggest growth challenge right now?</label>
      <div className="choice-grid"><CB val="getting-leads" label="Getting leads" field="biggestChallenge" data={d} upd={u}/><CB val="converting-leads" label="Converting leads" field="biggestChallenge" data={d} upd={u}/><CB val="operations" label="Operations / admin" field="biggestChallenge" data={d} upd={u}/><CB val="customer-support" label="Customer support" field="biggestChallenge" data={d} upd={u}/><CB val="hiring" label="Hiring / team" field="biggestChallenge" data={d} upd={u}/><CB val="retention" label="Retention / follow-up" field="biggestChallenge" data={d} upd={u}/></div>
    </div>
    <div className="field">
      <label className="fl">6. What are your growth goals over the next 12 months?</label>
      <textarea placeholder="e.g. Double revenue, open a new location, reduce admin by 50%, scale to 100 clients..." value={d.growthGoals||""} onChange={e=>u("growthGoals",e.target.value)}/>
    </div>
  </>);
}

function Step1({d,u}){
  const followUp=Array.isArray(d.followUpMethod)?d.followUpMethod:[];
  return(<>
    <div className="field">
      <label className="fl">7. How quickly do you respond to new leads?</label>
      <div className="choice-grid"><CB val="instantly" label="Instantly" hint="— under 5 min" field="responseSpeed" data={d} upd={u}/><CB val="within-1hr" label="Within 1 hour" field="responseSpeed" data={d} upd={u}/><CB val="within-24hr" label="Within 24 hours" field="responseSpeed" data={d} upd={u}/><CB val="longer" label="Longer than 24 hours" field="responseSpeed" data={d} upd={u}/></div>
      {d.responseSpeed==="longer"&&<WarnBox><strong style={{color:"#fca5a5"}}>Critical.</strong> Leads after 24 hours are up to 60× less likely to convert. Highest-impact fix in your audit.</WarnBox>}
      {d.responseSpeed==="within-24hr"&&<WarnBox>A 24-hour window loses motivated leads to faster competitors. This will be penalised in your score.</WarnBox>}
      {d.responseSpeed==="instantly"&&<div className="note">✓ Excellent — instant response is a strong competitive advantage.</div>}
    </div>
    <div className="field">
      <label className="fl">8. What happens when leads contact you outside business hours?</label>
      <div className="choice-grid"><CB val="manual-oos" label="Someone responds manually" field="outOfHours" data={d} upd={u}/><CB val="next-day" label="We reply the next day" field="outOfHours" data={d} upd={u}/><CB val="automation-oos" label="We use automation" field="outOfHours" data={d} upd={u}/><CB val="no-process-oos" label="No consistent process" field="outOfHours" data={d} upd={u}/></div>
      {(d.outOfHours==="next-day"||d.outOfHours==="no-process-oos")&&<WarnBox>Most businesses receive 40–60% of enquiries outside 9–5. No after-hours process means invisible at peak motivation.</WarnBox>}
      {d.outOfHours==="automation-oos"&&<div className="note">✓ After-hours automation is a major competitive edge — you're capturing leads while competitors sleep.</div>}
    </div>
    <div className="field">
      <label className="fl">9. How are leads followed up with?</label>
      <p className="multi-hint"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>Select all that apply</p>
      <div className="choice-grid"><MCB val="manual-calls" label="Manual calls / texts" field="followUpMethod" data={d} upd={u}/><MCB val="crm-automation" label="CRM automation" field="followUpMethod" data={d} upd={u}/><MCB val="emails" label="Email sequences" field="followUpMethod" data={d} upd={u}/><MCB val="whatsapp" label="WhatsApp" field="followUpMethod" data={d} upd={u}/><MCB val="no-follow-up" label="No structured follow-up" field="followUpMethod" data={d} upd={u}/></div>
      {followUp.includes("no-follow-up")&&<WarnBox>No follow-up = up to 48% of revenue left on the table. 80% of sales require 5+ touchpoints.</WarnBox>}
    </div>
    <div className="field">
      <label className="fl">10. Do you believe you lose leads to slow or inconsistent follow-up?</label>
      <div className="choice-grid"><CB val="yes" label="Yes" field="losesLeads" data={d} upd={u}/><CB val="no" label="No" field="losesLeads" data={d} upd={u}/><CB val="unsure" label="Unsure" field="losesLeads" data={d} upd={u}/></div>
      {d.losesLeads==="yes"&&<WarnBox>Your instinct is correct — your audit will quantify this in exact figures.</WarnBox>}
    </div>
    <div className="field">
      <label className="fl">11. Are appointments booked manually or automatically?</label>
      <div className="choice-grid"><CB val="manual-appt" label="Manual" field="appointmentBooking" data={d} upd={u}/><CB val="automated-appt" label="Automated" field="appointmentBooking" data={d} upd={u}/><CB val="both-appt" label="Both" field="appointmentBooking" data={d} upd={u}/></div>
      {d.appointmentBooking==="manual-appt"&&<WarnBox>Manual booking adds 10–20 min of back-and-forth per appointment — hours wasted at scale.</WarnBox>}
    </div>
    <div className="field">
      <label className="fl">12. What part of your sales process feels most inefficient?</label>
      <textarea placeholder="e.g. Chasing leads who go quiet, manually sending quotes, following up after enquiries..." value={d.salesInefficiency||""} onChange={e=>u("salesInefficiency",e.target.value)}/>
    </div>
  </>);
}

function Step2({d,u}){
  return(<>
    <div className="field">
      <label className="fl">13. Which tasks consume the most time weekly?</label>
      <p className="multi-hint"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>Select all that apply</p>
      <div className="choice-grid"><MCB val="scheduling" label="Scheduling" field="timeConsumingTasks" data={d} upd={u}/><MCB val="emails" label="Emails" field="timeConsumingTasks" data={d} upd={u}/><MCB val="customer-support" label="Customer support" field="timeConsumingTasks" data={d} upd={u}/><MCB val="admin-data" label="Admin / data entry" field="timeConsumingTasks" data={d} upd={u}/><MCB val="reporting" label="Reporting" field="timeConsumingTasks" data={d} upd={u}/><MCB val="staff-coord" label="Staff coordination" field="timeConsumingTasks" data={d} upd={u}/></div>
    </div>
    <div className="field">
      <label className="fl">14. Weekly hours spent on repetitive admin tasks?</label>
      <div className="choice-grid"><CB val="0-5hrs" label="0–5 hours" field="adminHours" data={d} upd={u}/><CB val="5-10hrs" label="5–10 hours" field="adminHours" data={d} upd={u}/><CB val="10-20hrs" label="10–20 hours" field="adminHours" data={d} upd={u}/><CB val="20+hrs" label="20+ hours" field="adminHours" data={d} upd={u}/></div>
      {d.adminHours==="20+hrs"&&<WarnBox><strong style={{color:"#fca5a5"}}>20+ hours is severe.</strong> That's half a full-time employee on tasks AI eliminates.</WarnBox>}
      {d.adminHours==="10-20hrs"&&<WarnBox>10–20 hrs/week on admin is a primary AI automation target in your audit.</WarnBox>}
    </div>
    <div className="field">
      <label className="fl">15. Do your team answer repetitive customer questions daily?</label>
      <div className="choice-grid"><CB val="yes-faq" label="Yes" field="repetitiveQuestions" data={d} upd={u}/><CB val="no-faq" label="No" field="repetitiveQuestions" data={d} upd={u}/></div>
      {d.repetitiveQuestions==="yes-faq"&&<div className="note">A trained AI chatbot handles these 24/7 at zero marginal cost — freeing your team for real conversations.</div>}
    </div>
    <div className="field">
      <label className="fl">16. How are appointments currently managed?</label>
      <p className="multi-hint"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>Select all that apply</p>
      <div className="choice-grid"><MCB val="appt-phone" label="Phone" field="apptManagement" data={d} upd={u}/><MCB val="appt-email" label="Email" field="apptManagement" data={d} upd={u}/><MCB val="appt-calendar" label="Calendar software" field="apptManagement" data={d} upd={u}/><MCB val="appt-manual" label="Manual coordination" field="apptManagement" data={d} upd={u}/></div>
    </div>
    <div className="field">
      <label className="fl">17. What operational bottleneck slows your growth the most?</label>
      <textarea placeholder="e.g. Onboarding takes too long, reporting takes 3 days, team spends hours answering enquiries..." value={d.operationalBottleneck||""} onChange={e=>u("operationalBottleneck",e.target.value)}/>
    </div>
    <div className="field">
      <label className="fl">18. Do missed appointments or no-shows affect your revenue?</label>
      <div className="choice-grid"><CB val="frequently" label="Frequently" field="noShowImpact" data={d} upd={u}/><CB val="occasionally" label="Occasionally" field="noShowImpact" data={d} upd={u}/><CB val="rarely" label="Rarely" field="noShowImpact" data={d} upd={u}/><CB val="never" label="Never" field="noShowImpact" data={d} upd={u}/></div>
      {d.noShowImpact==="frequently"&&<WarnBox><strong style={{color:"#fca5a5"}}>Frequent no-shows</strong> are a direct revenue hole. Automated reminders cut rates by 40–70%.</WarnBox>}
    </div>
  </>);
}

function Step3({d,u}){
  return(<>
    <div className="field">
      <label className="fl">19. How do customers mainly contact you?</label>
      <p className="multi-hint"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>Select all that apply</p>
      <div className="choice-grid"><MCB val="phone-cx" label="Phone" field="contactChannels" data={d} upd={u}/><MCB val="email-cx" label="Email" field="contactChannels" data={d} upd={u}/><MCB val="whatsapp-cx" label="WhatsApp" field="contactChannels" data={d} upd={u}/><MCB val="social-cx" label="Social / DMs" field="contactChannels" data={d} upd={u}/><MCB val="website-cx" label="Website form" field="contactChannels" data={d} upd={u}/></div>
    </div>
    <div className="field">
      <label className="fl">20. Are enquiries answered outside business hours?</label>
      <div className="choice-grid"><CB val="yes-cx-oos" label="Yes" field="cxOutOfHours" data={d} upd={u}/><CB val="no-cx-oos" label="No" field="cxOutOfHours" data={d} upd={u}/></div>
      {d.cxOutOfHours==="no-cx-oos"&&<WarnBox>Missing after-hours enquiries is a continuous revenue drain — customers rarely follow up the next day.</WarnBox>}
    </div>
    <div className="field">
      <label className="fl">21. Do customers frequently ask the same questions?</label>
      <div className="choice-grid"><CB val="yes-repeat" label="Yes" field="repeatQuestions" data={d} upd={u}/><CB val="no-repeat" label="No" field="repeatQuestions" data={d} upd={u}/></div>
      {d.repeatQuestions==="yes-repeat"&&<div className="note">A trained AI knowledge base handles these instantly — responding in under 10 seconds while your team focuses on deals.</div>}
    </div>
    <div className="field">
      <label className="fl">22. What causes the most customer frustration or delays?</label>
      <textarea placeholder="e.g. Waiting too long for replies, unclear pricing, not knowing their enquiry status..." value={d.customerFrustration||""} onChange={e=>u("customerFrustration",e.target.value)}/>
    </div>
  </>);
}

function Step4({d,u}){
  return(<>
    <div className="field">
      <label className="fl">23. Have you used AI tools in your business before?</label>
      <div className="choice-grid"><CB val="yes-ai" label="Yes" field="usedAI" data={d} upd={u}/><CB val="no-ai" label="No" field="usedAI" data={d} upd={u}/></div>
      {d.usedAI==="no-ai"&&<div className="note">Businesses new to AI often have the most to gain — your audit identifies the highest-impact, lowest-friction starting points.</div>}
    </div>
    <div className="field">
      <label className="fl">24. What concerns you most about AI?</label>
      <p className="multi-hint"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>Select all that apply</p>
      <div className="choice-grid"><MCB val="cost" label="Cost" field="aiConcerns" data={d} upd={u}/><MCB val="complexity" label="Complexity" field="aiConcerns" data={d} upd={u}/><MCB val="reliability" label="Reliability" field="aiConcerns" data={d} upd={u}/><MCB val="adoption" label="Team adoption" field="aiConcerns" data={d} upd={u}/><MCB val="dontknow" label="Don't know where to start" field="aiConcerns" data={d} upd={u}/></div>
      {hasVal(d,"aiConcerns","dontknow")&&<div className="note">Your 30-60-90 day roadmap addresses exactly that — every step ranked by ROI and ease of adoption.</div>}
    </div>
    <div className="field">
      <label className="fl">25. If you could automate one thing today, what would it be?</label>
      <textarea placeholder="e.g. Following up with leads automatically, answering enquiries 24/7, generating weekly reports..." value={d.automateOne||""} onChange={e=>u("automateOne",e.target.value)}/>
      <p className="fh">This becomes the #1 priority recommendation in your roadmap.</p>
    </div>
    <div className="field">
      <label className="fl">26. Would you like a custom AI implementation roadmap?</label>
      <div className="choice-grid"><CB val="yes-roadmap" label="Yes — build me a roadmap" field="wantsRoadmap" data={d} upd={u}/><CB val="no-roadmap" label="Just the audit is fine" field="wantsRoadmap" data={d} upd={u}/></div>
      {d.wantsRoadmap==="yes-roadmap"&&<div className="note">✓ Your report will include a prioritised 30-60-90 day AI implementation plan.</div>}
    </div>
  </>);
}

// ─── Audit Form Wrapper ───────────────────────────────────────────────────────
function AuditForm({onSubmit}){
  const[step,setStep]=useState(0);
  const[data,setData]=useState({});
  const upd=(k,v)=>setData(p=>({...p,[k]:v}));
  const ok=()=>{
    if(step===0) return data.industry&&data.teamSize&&data.region&&data.revTier&&data.biggestChallenge&&(data.growthGoals||"").trim().length>3;
    if(step===1) return data.responseSpeed&&data.outOfHours&&Array.isArray(data.followUpMethod)&&data.followUpMethod.length>0&&data.losesLeads&&data.appointmentBooking&&(data.salesInefficiency||"").trim().length>3;
    if(step===2) return Array.isArray(data.timeConsumingTasks)&&data.timeConsumingTasks.length>0&&data.adminHours&&data.repetitiveQuestions&&Array.isArray(data.apptManagement)&&data.apptManagement.length>0&&(data.operationalBottleneck||"").trim().length>3&&data.noShowImpact;
    if(step===3) return Array.isArray(data.contactChannels)&&data.contactChannels.length>0&&data.cxOutOfHours&&data.repeatQuestions&&(data.customerFrustration||"").trim().length>3;
    if(step===4) return data.usedAI&&Array.isArray(data.aiConcerns)&&data.aiConcerns.length>0&&(data.automateOne||"").trim().length>3&&data.wantsRoadmap;
    return false;
  };
  const StepComp=[Step0,Step1,Step2,Step3,Step4][step];
  return(
    <div style={{minHeight:"100vh",paddingTop:62}}>
      <ProgressHeader step={step}/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 20px 80px"}}>
        <div style={{width:"100%",maxWidth:620}}>
          <div className="card-glow anim" key={step} style={{marginTop:8}}>
            <div style={{marginBottom:26}}>
              <p style={{fontSize:10,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--gold)",marginBottom:6,fontFamily:"var(--sans)"}}>{STEPS[step].section} — {STEPS[step].title}</p>
              <p style={{fontSize:14,color:"var(--t2)",fontFamily:"var(--sans)"}}>{STEPS[step].sub}</p>
            </div>
            <StepComp d={data} u={upd}/>
            <hr className="div"/>
            <div style={{display:"flex",gap:10}}>
              {step>0&&<button className="btn bo" onClick={()=>setStep(s=>s-1)} style={{gap:6}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Back
              </button>}
              <button className="btn bp" style={{flex:1}} disabled={!ok()} onClick={()=>{if(step<4)setStep(s=>s+1);else onSubmit(data);}}>
                {step===4?"Generate My AI Growth Report":"Continue"}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
            {!ok()&&<p style={{fontSize:11,color:"var(--t3)",textAlign:"center",marginTop:10,fontFamily:"var(--sans)",letterSpacing:"0.02em"}}>Please complete all questions above to continue</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Analyzing ────────────────────────────────────────────────────────────────
function Analyzing(){
  const[active,setActive]=useState(0);
  const tasks=[
    {l:"Profiling your business and benchmarks",       d:"Matching industry benchmarks for your category…"},
    {l:"Scoring lead response and follow-up gaps",     d:"Calculating revenue penalty from response delays…"},
    {l:"Measuring operational overhead",               d:"Estimating hours and cost lost to manual work…"},
    {l:"Auditing customer experience friction",        d:"Mapping drop-off points in your customer journey…"},
    {l:"Building your AI Growth Roadmap",              d:"Ranking automation opportunities by ROI and speed…"},
  ];
  useEffect(()=>{
    let i=0;
    const t=setInterval(()=>{i++;if(i<tasks.length)setActive(i);else clearInterval(t);},1100);
    return()=>clearInterval(t);
  },[]);
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,paddingTop:100}}>
      <div style={{position:"fixed",top:"30%",left:"50%",transform:"translateX(-50%)",width:500,height:300,background:"radial-gradient(ellipse,rgba(200,169,110,0.07) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <div style={{maxWidth:460,width:"100%",textAlign:"center",position:"relative",zIndex:1}}>
        <div style={{position:"relative",width:72,height:72,margin:"0 auto 36px"}}>
          <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"1px solid rgba(200,169,110,0.15)",animation:"pulse 2s ease infinite"}}/>
          <div style={{position:"absolute",inset:6,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.06)",borderTopColor:"var(--gold)",animation:"spin .9s linear infinite"}}/>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:12,height:12,borderRadius:"50%",background:"var(--gold)",animation:"pulse 1.4s ease infinite"}}/>
          </div>
        </div>
        <h2 style={{fontSize:28,marginBottom:10,color:"var(--t1)"}}>Building Your Report</h2>
        <p style={{fontSize:14,color:"var(--t2)",marginBottom:44,fontFamily:"var(--sans)",lineHeight:1.7}}>Analysing your answers — takes about 5 seconds.</p>
        <div style={{textAlign:"left",display:"flex",flexDirection:"column",gap:18}}>
          {tasks.map((t,i)=>(
            <div key={i} style={{display:"flex",gap:14,alignItems:"flex-start",opacity:i<=active?1:0.15,transition:"opacity .55s ease"}}>
              <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,marginTop:1,background:i<active?"var(--gold)":i===active?"rgba(200,169,110,0.15)":"rgba(255,255,255,0.03)",border:`1px solid ${i<=active?(i<active?"var(--gold)":"rgba(200,169,110,0.5)"):"rgba(255,255,255,0.08)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#04050A",transition:"all .4s"}}>
                {i<active?<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#04050A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>:i===active?<span style={{width:6,height:6,borderRadius:"50%",background:"var(--gold)",display:"block",animation:"pulse 1s infinite"}}/>:""}
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:500,color:i<=active?"var(--t1)":"var(--t3)",transition:"color .4s",fontFamily:"var(--sans)"}}>{t.l}</div>
                {i===active&&<div style={{fontSize:12,color:"var(--gold)",marginTop:3,animation:"fadeIn .3s ease",fontFamily:"var(--sans)"}}>{t.d}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Report Components ────────────────────────────────────────────────────────
function RiskMeter({score}){
  const col=score>=68?"#10b981":score>=42?"#f59e0b":"#ef4444";
  const lbl=score>=68?"Moderate":score>=42?"At Risk":"Critical";
  const r=52,c=2*Math.PI*r,off=c-(score/100)*c;
  const cx=100,cy=90;
  const toRad=deg=>deg*Math.PI/180;
  const arc=(s,e,rad)=>{
    const sx=cx+rad*Math.cos(toRad(s)),sy=cy+rad*Math.sin(toRad(s));
    const ex=cx+rad*Math.cos(toRad(e)),ey=cy+rad*Math.sin(toRad(e));
    return `M ${sx} ${sy} A ${rad} ${rad} 0 0 1 ${ex} ${ey}`;
  };
  const fillEnd=-180+((score/100)*180);
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
      <div style={{position:"relative"}}>
        <div style={{position:"absolute",inset:-8,borderRadius:"50%",background:`radial-gradient(ellipse,${col}15 0%,transparent 70%)`}}/>
        <svg viewBox="0 0 200 100" style={{width:200,overflow:"visible"}}>
          <path d={arc(-180,-120,r)} fill="none" stroke="rgba(239,68,68,0.18)" strokeWidth="10" strokeLinecap="round"/>
          <path d={arc(-120,-60,r)} fill="none" stroke="rgba(245,158,11,0.18)" strokeWidth="10" strokeLinecap="round"/>
          <path d={arc(-60,0,r)} fill="none" stroke="rgba(16,185,129,0.18)" strokeWidth="10" strokeLinecap="round"/>
          <path d={arc(-180,Math.min(fillEnd,-0.1),r)} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round" style={{filter:`drop-shadow(0 0 6px ${col}88)`,transition:"all 1.4s cubic-bezier(0.16,1,0.3,1)"}}/>
          <g transform={`translate(${cx},${cy})`}>
            <g transform={`rotate(${-180+(score/100)*180})`} style={{transition:"transform 1.4s cubic-bezier(0.16,1,0.3,1)"}}>
              <line x1="0" y1="0" x2={r-16} y2="0" stroke={col} strokeWidth="2.5" strokeLinecap="round" style={{filter:"drop-shadow(0 2px 6px rgba(0,0,0,0.6))"}}/>
              <circle cx="0" cy="0" r="5" fill={col} style={{filter:"drop-shadow(0 2px 6px rgba(0,0,0,0.5))"}}/>
            </g>
          </g>
          <text x={cx} y={cy-8} textAnchor="middle" fill="#F5F2EC" fontSize="24" fontWeight="700" fontFamily="'JetBrains Mono',monospace">{score}</text>
          <text x={cx} y={cy+6} textAnchor="middle" fill={col} fontSize="10" fontFamily="var(--sans)">/100</text>
        </svg>
      </div>
      <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:100,fontSize:12,fontWeight:600,fontFamily:"var(--sans)",background:`${col}18`,color:col,border:`1px solid ${col}35`}}>{lbl}</span>
    </div>
  );
}

function StatCard({label,value,sub,vc="var(--t1)"}){
  return(
    <div className="card" style={{padding:"18px 20px"}}>
      <div style={{fontSize:10,color:"var(--t3)",marginBottom:6,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:"var(--sans)"}}>{label}</div>
      <div style={{fontSize:22,color:vc,marginBottom:4,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",animation:"countUp .5s ease"}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:"var(--t3)",lineHeight:1.55,fontFamily:"var(--sans)",letterSpacing:"0.01em"}}>{sub}</div>}
    </div>
  );
}

function BarRow({label,val,pct,colorClass,note}){
  return(
    <div style={{marginBottom:22}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
        <span style={{fontSize:13,color:"var(--t2)",fontFamily:"var(--sans)"}}>{label}</span>
        <span style={{fontSize:13,fontFamily:"'JetBrains Mono',monospace",fontWeight:500,color:colorClass==="red"?"#EF4444":colorClass==="yellow"?"#F59E0B":"#10B981"}}>{val}</span>
      </div>
      <div className="bar-track"><div className={`bar-fill ${colorClass}`} style={{width:`${Math.min(pct,100)}%`}}/></div>
      {note&&<div style={{fontSize:11,color:"var(--t3)",marginTop:5,fontFamily:"var(--sans)",lineHeight:1.55}}>{note}</div>}
    </div>
  );
}

function OppCard({title,impact,priority,idx}){
  const pc=priority==="CRITICAL"?"pc":priority==="HIGH"?"ph":"pm";
  const bc=priority==="CRITICAL"?"var(--red)":priority==="HIGH"?"var(--yellow)":"var(--gold)";
  return(
    <div className="card" style={{padding:"18px 20px",display:"flex",gap:16,alignItems:"flex-start",animation:"fadeUp .5s cubic-bezier(0.16,1,0.3,1) both",animationDelay:`${idx*0.09}s`,borderLeft:`2px solid ${bc}`}}>
      <div style={{flexShrink:0,paddingTop:1}}><span className={`pill ${pc}`}>{priority}</span></div>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:6,color:"var(--t1)",fontFamily:"var(--sans)",letterSpacing:"-0.01em"}}>{title}</div>
        <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.75,fontFamily:"var(--sans)"}}>{impact}</div>
      </div>
    </div>
  );
}

async function exportPDF(reportRef){
  if(typeof window==="undefined" || !reportRef?.current) return;
  try{
    const html2pdf=(await import("html2pdf.js")).default;
    const options = {
      margin: 0,
      filename: "estate-flow-ai-audit.pdf",
      image: {type: "png", quality: 1},
      html2canvas: {scale: 3, useCORS: true, backgroundColor: "#07080D"},
      jsPDF: {unit: "mm", format: "a4", orientation: "portrait"},
      pagebreak: {mode: ["css", "legacy"]},
    };
    html2pdf().set(options).from(reportRef.current).save();
  }catch(e){
    window.print();
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────
function Report({fd,lead,onRestart,fmt,sym,currency,user}){
  const m=calcScore(fd);
  const[aiTxt,setAiTxt]=useState("");
  const[aiLoad,setAiLoad]=useState(true);
  const reportRef=useRef(null);
  const bizLabel=INDUSTRY_LABELS[fd.industry]||"Business";
  const reg=getRegion(fd.region||"uk");

  const opps=[
    {title:fd.responseSpeed==="longer"||fd.responseSpeed==="within-24hr"?"AI Lead Response System — 24/7 Instant Engagement":"Intelligent Lead Qualification & Routing",impact:fd.responseSpeed==="longer"?`Your response time (longer than 24 hrs) is causing an estimated ${fmt(m.conversionLoss)}/month in lost conversions. An AI system responding in under 2 minutes — even at midnight — recovers the majority before leads contact a competitor.`:fd.responseSpeed==="within-24hr"?`A 24-hour window costs you motivated leads to faster competitors. AI-powered instant response is estimated to recover ${fmt(m.conversionLoss)}/month.`:`With fast response time, the next step is smarter qualification — AI routing ensures every lead reaches the right person instantly.`,priority:fd.responseSpeed==="longer"?"CRITICAL":fd.responseSpeed==="within-24hr"?"HIGH":"MEDIUM"},
    {title:m.followUp.includes("no-follow-up")?"Automated Follow-Up Sequences — Stop Losing Warm Leads":"Multi-Channel Follow-Up Automation",impact:m.followUp.includes("no-follow-up")?`No structured follow-up means walking away after first contact. 80% of sales require 5+ touchpoints. Automated sequences alone could recover ${fmt(m.followUpLoss)}/month.`:`Your current follow-up (${m.followUp.join(", ")}) is largely manual. Automating with behaviour-triggered sequences typically recovers 20–35% more conversions from the same lead volume.`,priority:m.followUp.includes("no-follow-up")?"CRITICAL":"HIGH"},
    {title:fd.outOfHours==="no-process-oos"||fd.outOfHours==="next-day"?"After-Hours AI — Capture Enquiries While You Sleep":"After-Hours Optimisation",impact:fd.outOfHours==="no-process-oos"||fd.outOfHours==="next-day"?`No after-hours process means invisible at peak motivation moments. Estimated ${fmt(m.afterHoursMiss)}/month slipping away. An AI assistant covers these windows automatically.`:`You have some after-hours coverage. Full automation increases off-peak conversion by 30–50%.`,priority:fd.outOfHours==="no-process-oos"||fd.outOfHours==="next-day"?"HIGH":"MEDIUM"},
    {title:fd.adminHours==="20+hrs"||fd.adminHours==="10-20hrs"?`Workflow Automation — Reclaim ${m.weeklyAdminHrs} Hours/Week`:"Smart Admin Automation",impact:`Your team spends ~${m.monthlyAdminHrs} hours/month on repetitive admin — worth ${fmt(m.adminWasteCost)}/month in labour. AI workflow automation eliminates 60–70% of this within 60 days.`,priority:fd.adminHours==="20+hrs"?"CRITICAL":fd.adminHours==="10-20hrs"?"HIGH":"MEDIUM"},
    {title:fd.noShowImpact==="frequently"?"No-Show Reduction — Automated Reminders":fd.repetitiveQuestions==="yes-faq"||fd.repeatQuestions==="yes-repeat"?"AI FAQ Chatbot — 24/7 Customer Answers":"Customer Experience AI",impact:fd.noShowImpact==="frequently"?`Frequent no-shows = ${fmt(m.noShowCost)}/month direct loss. Automated reminders cut no-show rates by 40–70% in the first 30 days.`:fd.repetitiveQuestions==="yes-faq"||fd.repeatQuestions==="yes-repeat"?`Your team answers the same questions daily — a perfect AI target. A trained chatbot handles these 24/7 at zero marginal cost.`:`An AI support layer handles routine enquiries automatically — cutting workload by 40–60%.`,priority:fd.noShowImpact==="frequently"||fd.repetitiveQuestions==="yes-faq"?"HIGH":"MEDIUM"},
  ];

  useEffect(()=>{
    const followUpStr=m.followUp.length?m.followUp.join(", "):"none";
    const concerns=Array.isArray(fd.aiConcerns)?fd.aiConcerns.join(", "):"not specified";
    const tasks=Array.isArray(fd.timeConsumingTasks)?fd.timeConsumingTasks.join(", "):"not specified";
    const prompt=`You are a senior AI business growth consultant at Estate Flow AI. Analyse this ${bizLabel} business and write a sharp, specific, data-driven report. Reference actual answers. No generic advice. Second person throughout.

Business profile:
- Industry: ${bizLabel} | Team: ${fd.teamSize} | Revenue tier: ${fd.revTier} | Region: ${fd.region} | Currency: ${currency}
- Biggest challenge: ${fd.biggestChallenge} | Growth goals: ${fd.growthGoals}
- Lead response speed: ${fd.responseSpeed} | Out-of-hours: ${fd.outOfHours}
- Follow-up methods: ${followUpStr} | Loses leads: ${fd.losesLeads}
- Appointment booking: ${fd.appointmentBooking} | Sales inefficiency: ${fd.salesInefficiency}
- Time-consuming tasks: ${tasks} | Weekly admin hours: ${fd.adminHours}
- Repetitive questions: ${fd.repetitiveQuestions} | No-show impact: ${fd.noShowImpact}
- Contact channels: ${Array.isArray(fd.contactChannels)?fd.contactChannels.join(", "):"not specified"}
- After-hours cx: ${fd.cxOutOfHours} | Customer frustration: ${fd.customerFrustration}
- Used AI: ${fd.usedAI} | AI concerns: ${concerns} | Would automate: ${fd.automateOne}
- AI Growth Score: ${m.score}/100
- Estimated monthly revenue leak: ${fmt(m.totalMonthlyLeak)} | Annual: ${fmt(m.totalAnnualLeak)}

Write exactly 4 punchy paragraphs: (1) Biggest revenue leak with exact ${currency} figure. (2) Why their response speed and follow-up gaps compound each other. (3) How ${fd.adminHours} weekly admin + "${fd.operationalBottleneck||"manual overhead"}" drain growth capacity. (4) Top 2 AI fixes prioritising "${fd.automateOne||"key bottlenecks"}" with realistic ROI timelines. Be specific, punchy, no filler.`;

    (async()=>{
      try{
        const res=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,score:m.score,currency,businessName:lead?.company||"",email:lead?.email||""})});
        const data=await res.json();
        const reportText=data.text||buildFallback(bizLabel,m,fd,fmt);
        setAiTxt(reportText);
        fetch("/api/capture",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lead:lead||{},formData:fd,aiReport:reportText,score:m.score,currency,userId:user?.id||null})}).catch(()=>{});
        fetch("/api/email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lead:lead||{},formData:fd,aiReport:reportText,score:m.score,currency,fmt:{monthly:fmt(m.totalMonthlyLeak),annual:fmt(m.totalAnnualLeak),response:fmt(m.conversionLoss),followup:fmt(m.followUpLoss)}})}).catch(()=>{});
      }catch{
        const reportText=buildFallback(bizLabel,m,fd,fmt);
        setAiTxt(reportText);
        fetch("/api/capture",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lead:lead||{},formData:fd,aiReport:reportText,score:m.score,currency,userId:user?.id||null})}).catch(()=>{});
      }finally{setAiLoad(false);}
    })();
  },[]);

  const date=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});

  return(
    <div ref={reportRef} style={{maxWidth:820,margin:"0 auto",padding:"90px 20px 80px",position:"relative",zIndex:1}}>
      <div style={{marginBottom:36,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <p style={{fontSize:10,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--gold)",marginBottom:8,fontFamily:"var(--sans)"}}>Estate Flow AI · Growth Audit · {date}</p>
          <h1 style={{fontSize:"clamp(28px,4vw,42px)",color:"var(--t1)",marginBottom:8}}>Your Growth Audit<br/>Is Ready</h1>
          <p style={{color:"var(--t2)",fontSize:14,fontFamily:"var(--sans)",letterSpacing:"0.01em"}}><strong style={{color:"var(--t1)"}}>{bizLabel}</strong> · {fd.teamSize} team · {reg.sym}{fd.revTier} · {reg.label}</p>
        </div>
        <div style={{display:"flex",gap:8,flexShrink:0,marginTop:4}}>
          <button className="pdf-btn" onClick={()=>exportPDF(reportRef)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export PDF
          </button>
          <button className="btn bo" style={{fontSize:12,padding:"8px 14px"}} onClick={onRestart}>New Audit</button>
        </div>
      </div>

      <div className="card-glow anim d1" style={{display:"flex",gap:28,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <RiskMeter score={m.score}/>
        <div style={{flex:1,minWidth:220}}>
          <p className="slabel">AI Growth Score</p>
          <h2 style={{fontSize:"clamp(16px,2.5vw,22px)",color:"var(--t1)",marginBottom:10}}>
            {m.score<42?"Critical gaps — revenue leaking daily":m.score<68?"Several AI opportunities — clear room to grow":"Good foundation — AI unlocks the next level"}
          </h2>
          <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.8,fontFamily:"var(--sans)"}}>
            Top businesses score <strong style={{color:"var(--t1)"}}>75+</strong>. Your score of <strong style={{color:m.score<42?"var(--red)":m.score<68?"var(--yellow)":"var(--green)"}}>{m.score}/100</strong>
            {m.score<42?" reveals multiple compounding problems actively costing you revenue every day.":m.score<68?" shows clear gaps in lead handling, operations, and customer experience.":" shows a solid base with specific automation opportunities ready to unlock growth."}
          </p>
        </div>
      </div>

      <div style={{marginBottom:16}}>
        <p className="slabel">Revenue Leak — Where Money Is Escaping</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
          <StatCard label="Total Monthly Leak"     value={fmt(m.totalMonthlyLeak)} sub="Across response, follow-up, admin & no-shows" vc="var(--red)"/>
          <StatCard label="Annual Revenue at Risk" value={fmt(m.totalAnnualLeak)}  sub="If gaps remain unfixed over 12 months"        vc="var(--red)"/>
          <StatCard label="Response Speed Loss"    value={fmt(m.conversionLoss)}   sub={`From ${fd.responseSpeed} response time`}      vc="var(--yellow)"/>
          <StatCard label="Follow-Up Leakage"      value={fmt(m.followUpLoss)}     sub="Leads lost to inconsistent follow-up"           vc="var(--yellow)"/>
        </div>
      </div>

      <div className="card anim d2" style={{marginBottom:16}}>
        <p className="slabel">Operations & Efficiency Breakdown</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:28}}>
          <div>
            <div style={{fontSize:11,color:"var(--t3)",marginBottom:5,fontFamily:"var(--sans)",letterSpacing:"0.05em",textTransform:"uppercase"}}>Weekly admin hours wasted</div>
            <div style={{fontSize:30,color:"var(--yellow)",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{m.weeklyAdminHrs} hrs</div>
            <div style={{fontSize:11,color:"var(--t3)",marginTop:3,fontFamily:"var(--sans)"}}>Team of {fd.teamSize}</div>
          </div>
          <div>
            <div style={{fontSize:11,color:"var(--t3)",marginBottom:5,fontFamily:"var(--sans)",letterSpacing:"0.05em",textTransform:"uppercase"}}>Monthly cost of that overhead</div>
            <div style={{fontSize:30,color:"var(--red)",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{fmt(m.adminWasteCost)}</div>
            <div style={{fontSize:11,color:"var(--t3)",marginTop:3,fontFamily:"var(--sans)"}}>Estimated labour cost</div>
          </div>
        </div>
        <BarRow label="Lead response speed" val={fd.responseSpeed==="instantly"?"Optimal":fd.responseSpeed==="within-1hr"?"Good":fd.responseSpeed==="within-24hr"?"Slow":"Critical"} pct={fd.responseSpeed==="instantly"?100:fd.responseSpeed==="within-1hr"?72:fd.responseSpeed==="within-24hr"?38:12} colorClass={fd.responseSpeed==="instantly"?"green":fd.responseSpeed==="within-1hr"?"green":fd.responseSpeed==="within-24hr"?"yellow":"red"} note={fd.responseSpeed==="longer"?"Over 24 hours — highest-impact fix. AI response eliminates this entirely.":fd.responseSpeed==="within-24hr"?"24hrs loses motivated leads. AI in under 2 min recovers most of this.":fd.responseSpeed==="within-1hr"?"Good — AI can push this to under 2 min 24/7.":"Optimal — AI ensures this scales without adding headcount."}/>
        <BarRow label="After-hours coverage" val={fd.outOfHours==="automation-oos"?"Automated":fd.outOfHours==="manual-oos"?"Manual":fd.outOfHours==="next-day"?"Next day":"No process"} pct={fd.outOfHours==="automation-oos"?100:fd.outOfHours==="manual-oos"?60:fd.outOfHours==="next-day"?25:5} colorClass={fd.outOfHours==="automation-oos"?"green":fd.outOfHours==="manual-oos"?"yellow":"red"} note="Missing after-hours enquiries is a continuous, silent revenue drain."/>
        <BarRow label="Admin overhead intensity" val={fd.adminHours} pct={fd.adminHours==="0-5hrs"?15:fd.adminHours==="5-10hrs"?40:fd.adminHours==="10-20hrs"?70:95} colorClass={fd.adminHours==="0-5hrs"?"green":fd.adminHours==="5-10hrs"?"yellow":"red"} note={`${m.monthlyAdminHrs} hours/month = ${fmt(m.adminWasteCost)} in labour that AI automation can largely eliminate.`}/>
        <BarRow label="No-show / missed appointment impact" val={fd.noShowImpact||"N/A"} pct={fd.noShowImpact==="never"?5:fd.noShowImpact==="rarely"?25:fd.noShowImpact==="occasionally"?55:85} colorClass={fd.noShowImpact==="never"?"green":fd.noShowImpact==="rarely"?"yellow":"red"} note={fd.noShowImpact==="frequently"?`Frequent no-shows = ${fmt(m.noShowCost)}/month lost. Automated reminders cut rates by 40–70%.`:"Automated reminders keep this near zero."}/>
      </div>

      <div className="card-accent anim d3" style={{marginBottom:16}}>
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:18}}>
          <div style={{width:38,height:38,borderRadius:10,background:"rgba(200,169,110,0.12)",border:"1px solid rgba(200,169,110,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>◈</div>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"var(--t1)",fontFamily:"var(--sans)",letterSpacing:"-0.01em"}}>AI Growth Analysis — {bizLabel}</div>
            <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--sans)",letterSpacing:"0.02em"}}>Powered by Estate Flow AI · Built from your answers</div>
          </div>
        </div>
        {aiLoad?(
          <div style={{display:"flex",alignItems:"center",gap:12,color:"var(--t2)",fontSize:13,padding:"8px 0",fontFamily:"var(--sans)"}}>
            <div className="spinner"/><span>Generating your personalised analysis…</span>
          </div>
        ):(
          <div style={{fontSize:14,color:"var(--t2)",lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"var(--sans)"}}>{aiTxt}</div>
        )}
      </div>

      {fd.wantsRoadmap==="yes-roadmap"&&(
        <div className="card anim" style={{marginBottom:16}}>
          <p className="slabel">AI Implementation Roadmap — 30 / 60 / 90 Days</p>
          {[
            {phase:"Days 1–30",label:"Quick Wins",color:"var(--green)",items:[fd.responseSpeed!=="instantly"?"Deploy AI lead response system (website + WhatsApp + social DMs)":"Optimise and A/B test lead qualification flow",m.followUp.includes("no-follow-up")?"Build 5-step automated follow-up sequence (WhatsApp + email)":"Upgrade follow-up to behaviour-triggered automation","Set up after-hours AI assistant across all contact channels"]},
            {phase:"Days 31–60",label:"Operations",color:"var(--gold)",items:["Automate top 3 admin tasks: "+(Array.isArray(fd.timeConsumingTasks)?fd.timeConsumingTasks.slice(0,2).join(" + "):"scheduling + reporting"),fd.repetitiveQuestions==="yes-faq"?"Build AI FAQ chatbot trained on your most common questions":"Implement CRM automation and lead scoring",fd.appointmentBooking==="manual-appt"?"Deploy self-serve automated booking with confirmation sequences":"Integrate booking with automated reminders"]},
            {phase:"Days 61–90",label:"Scale",color:"var(--yellow)",items:["AI reporting dashboards — revenue, leads, conversion auto-delivered weekly","Customer re-engagement sequences for lapsed enquiries","Priority automation: "+(fd.automateOne?fd.automateOne.slice(0,70)+(fd.automateOne.length>70?"…":""):"Full pipeline AI integration based on 60-day data")]},
          ].map(({phase,label,color,items})=>(
            <div key={phase} style={{marginBottom:22}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <span style={{fontSize:10,fontWeight:700,color,border:`1px solid ${color}`,borderRadius:100,padding:"3px 10px",fontFamily:"var(--sans)",letterSpacing:"0.06em",opacity:0.9}}>{phase}</span>
                <span style={{fontSize:12,fontWeight:700,color:"var(--t2)",fontFamily:"var(--sans)",letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</span>
              </div>
              {items.map((item,i)=>(<div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10,paddingLeft:4}}><div style={{width:5,height:5,borderRadius:"50%",background:color,flexShrink:0,marginTop:7}}/><div style={{fontSize:13,color:"var(--t2)",lineHeight:1.7,fontFamily:"var(--sans)"}}>{item}</div></div>))}
            </div>
          ))}
        </div>
      )}

      <div style={{marginBottom:16}}>
        <p className="slabel">AI Automation Opportunities — Ranked by ROI</p>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>{opps.map((o,i)=><OppCard key={i} {...o} idx={i}/>)}</div>
      </div>

      <div className="card-accent anim" style={{marginBottom:28}}>
        <p className="slabel">Your Growth Potential</p>
        <div style={{display:"flex",alignItems:"baseline",gap:14,flexWrap:"wrap",marginBottom:14}}>
          <div style={{fontSize:48,color:"var(--green)",fontWeight:700,fontFamily:"var(--serif)",fontStyle:"italic"}}>{fmt(m.totalAnnualLeak)}</div>
          <div style={{fontSize:16,color:"var(--t2)",fontFamily:"var(--sans)"}}>recoverable annual revenue</div>
        </div>
        <p style={{fontSize:14,color:"var(--t2)",lineHeight:1.85,fontFamily:"var(--sans)"}}>
          Fixing your lead response, follow-up, after-hours, and admin gaps could recover <strong style={{color:"var(--green)"}}>{fmt(m.totalMonthlyLeak)}/month</strong> — or <strong style={{color:"var(--green)"}}>{fmt(m.totalAnnualLeak)} per year</strong> — without spending a single extra {sym} on advertising.
          {fd.growthGoals&&fd.growthGoals.length>10&&<span> Your goal — <em>"{fd.growthGoals.slice(0,80)}{fd.growthGoals.length>80?"…":""}"</em> — is achievable through the roadmap above.</span>}
        </p>
      </div>

      <div className="card-obsidian">
        <div style={{position:"absolute",top:"30%",left:"50%",transform:"translateX(-50%)",width:400,height:200,background:"radial-gradient(ellipse,rgba(200,169,110,0.06) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:"var(--gold)",marginBottom:18,fontFamily:"var(--sans)"}}>Exclusive Strategy Session</div>
          <h2 style={{fontSize:"clamp(24px,3.5vw,36px)",color:"#FAF8F4",marginBottom:14}}>Recover {fmt(m.totalMonthlyLeak)}/month<br/>with AI — in 30 days</h2>
          <p style={{color:"rgba(250,248,244,0.5)",fontSize:15,maxWidth:420,margin:"0 auto 32px",lineHeight:1.85,fontFamily:"var(--sans)"}}>Estate Flow AI builds and deploys a custom AI system for your {bizLabel} business — lead response, follow-up automation, after-hours coverage, and workflow AI — configured around your growth model.</p>
          <button className="btn-gold" onClick={()=>window.open("https://calendly.com/charanrathod-inf/30min","_blank")} style={{display:"inline-flex",alignItems:"center",gap:12}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Book My Free Strategy Call
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:20,flexWrap:"wrap"}}>
            {["📅 30-Min Confidential Session","🔒 100% Secure & Private","✓ No Commitment Required"].map((t,i)=>(<span key={i} style={{fontSize:12,color:"rgba(200,169,110,0.5)",fontFamily:"var(--sans)",letterSpacing:"0.02em"}}>{t}</span>))}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildFallback(bizLabel,m,fd,fmt){
  const followUpStr=m.followUp.includes("no-follow-up")||m.followUp.length===0?"no structured follow-up":m.followUp.join(" + ");
  return `Your ${bizLabel} business is leaking an estimated ${fmt(m.totalMonthlyLeak)}/month across four fixable areas. ${fd.responseSpeed==="longer"?"A response time longer than 24 hours is your single biggest revenue killer — enquiries go cold before you reply.":fd.responseSpeed==="within-24hr"?"A 24-hour response window costs you the most motivated leads, who compare 3–5 options within hours of enquiring.":"Your response speed is solid, but the follow-up and after-hours gaps are where revenue is escaping."} With ${followUpStr} and ${fd.adminHours} of weekly admin overhead, your team is spending time on tasks that should be automated — while warm leads go cold. Your stated priority — "${fd.automateOne||"streamlining your workflow"}" — is exactly where Estate Flow AI would start: a 24/7 AI response and follow-up system that works while your team focuses on high-value work, typically recovering 30–50% of the identified ${fmt(m.totalMonthlyLeak)}/month within the first 90 days.`;
}

// ─── History Screen ───────────────────────────────────────────────────────────
function HistoryScreen({user,onSelect,onBack}){
  const[audits,setAudits]=useState([]);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!user) return;
    fetch(`/api/audits?userId=${user.id}&email=${encodeURIComponent(user.email||"")}`)
      .then(r=>r.json()).then(d=>{setAudits(d.audits||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[user]);
  const scoreColor=s=>s>=68?"var(--green)":s>=42?"var(--yellow)":"var(--red)";
  return(
    <div style={{minHeight:"100vh",padding:"90px 20px 60px",maxWidth:700,margin:"0 auto",position:"relative",zIndex:1}}>
      <button className="btn bo" style={{fontSize:12,padding:"7px 14px",marginBottom:28,gap:6}} onClick={onBack}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Back
      </button>
      <p style={{fontSize:10,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--gold)",marginBottom:8,fontFamily:"var(--sans)"}}>Audit History</p>
      <h1 style={{fontSize:"clamp(24px,4vw,36px)",color:"var(--t1)",marginBottom:8}}>Your Past Reports</h1>
      <p style={{fontSize:14,color:"var(--t2)",fontFamily:"var(--sans)",marginBottom:28}}>Click any audit to view the full report.</p>
      {loading&&<div className="card" style={{padding:40,textAlign:"center"}}><div className="spinner" style={{margin:"0 auto"}}/><p style={{color:"var(--t2)",marginTop:16,fontFamily:"var(--sans)",fontSize:13}}>Loading your audit history…</p></div>}
      {!loading&&audits.length===0&&<div className="card" style={{padding:40,textAlign:"center"}}><div style={{fontSize:36,marginBottom:12}}>📋</div><p style={{color:"var(--t2)",fontFamily:"var(--sans)",fontSize:14,lineHeight:1.7}}>No past audits found.<br/>Complete your first audit to see it here.</p></div>}
      {!loading&&audits.length>0&&(
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          {audits.map((a,i)=>(
            <div key={a.id} className="history-card" onClick={()=>onSelect(a)} style={{borderBottom:i<audits.length-1?"1px solid rgba(255,255,255,0.06)":"none"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
                <div style={{flex:1,minWidth:200}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--t1)",fontFamily:"var(--sans)"}}>{INDUSTRY_LABELS[a.industry]||"Business"}</span>
                    {a.region&&<span style={{fontSize:11,color:"var(--t3)",fontFamily:"var(--sans)"}}>{a.region}</span>}
                  </div>
                  <div style={{fontSize:11,color:"var(--t3)",fontFamily:"var(--sans)",letterSpacing:"0.02em"}}>{new Date(a.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}{a.team_size&&` · Team: ${a.team_size}`}{a.revenue_tier&&` · Rev: ${a.revenue_tier}`}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  {a.ai_score&&<div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:scoreColor(a.ai_score)}}>{a.ai_score}</div><div style={{fontSize:9,color:"var(--t3)",fontFamily:"var(--sans)",letterSpacing:"0.06em",textTransform:"uppercase"}}>Score</div></div>}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App(){
  const[screen,setScreen]=useState("landing");
  const[fd,setFd]=useState(null);
  const[lead,setLead]=useState(null);
  const[user,setUser]=useState(null);
  const[showAuth,setShowAuth]=useState(false);
  const[pendingFd,setPendingFd]=useState(null);
  const[hasHistory,setHasHistory]=useState(false);
  const[selectedAudit,setSelectedAudit]=useState(null);

  // ── Hydration-safe style injection ──────────────────────────────────────────
  useEffect(()=>{
    if(typeof document==="undefined") return;
    const existing=document.getElementById("ef-styles");
    if(existing) return;
    const el=document.createElement("style");
    el.id="ef-styles";
    el.textContent=STYLES;
    document.head.appendChild(el);
    return()=>{ /* keep styles across nav */ };
  },[]);

  const reg=getRegion(fd?.region||"uk");
  const sym=reg.sym;
  const currency=reg.currency;
  const fmt=makeFmt(sym);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if(session?.user){
        setUser(session.user);
        const params=new URLSearchParams(window.location.search);
        if(params.get("audit")==="true"){
          const saved=sessionStorage.getItem("audit_fd");
          if(saved){
            const restoredFd=JSON.parse(saved);
            sessionStorage.removeItem("audit_fd");
            setFd(restoredFd);
            const profile={name:session.user.user_metadata?.full_name||"",email:session.user.email||"",phone:"",company:""};
            setLead(profile);
            fetch("/api/capture",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lead:profile,formData:restoredFd,userId:session.user.id})}).catch(()=>{});
            setScreen("analyzing");
            setTimeout(()=>setScreen("report"),5800);
            window.history.replaceState({},"",window.location.pathname);
          }
        }
        fetch(`/api/audits?userId=${session.user.id}`).then(r=>r.json()).then(d=>{if(d.audits?.length>0)setHasHistory(true);}).catch(()=>{});
      }
    });
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user??null);});
    return()=>subscription.unsubscribe();
  },[]);

  const handleFormSubmit=useCallback((data)=>{setFd(data);setPendingFd(data);setShowAuth(true);},[]);
  const handleAuthSuccess=useCallback((leadData)=>{setLead(leadData);setShowAuth(false);setScreen("analyzing");setTimeout(()=>setScreen("report"),5800);},[]);
  const handleSelectAudit=useCallback((audit)=>{setSelectedAudit(audit);setScreen("history-report");},[]);
  const signOut=async()=>{await supabase.auth.signOut();setUser(null);setHasHistory(false);};
  const restart=()=>{setFd(null);setLead(null);setPendingFd(null);setScreen("landing");};

  return(
    <>
      <div className="bg-fixed"/>
      <div className="bg-overlay"/>
      <div className="bg-grain"/>
      <Nav user={user} onSignOut={signOut} onShowHistory={()=>setScreen("history")} hasHistory={hasHistory&&!!user}/>
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onSuccess={handleAuthSuccess} pendingFd={pendingFd}/>}
      {screen==="landing"   && <Landing onStart={()=>setScreen("form")}/>}
      {screen==="form"      && <AuditForm onSubmit={handleFormSubmit}/>}
      {screen==="analyzing" && <Analyzing/>}
      {screen==="report"    && fd && <Report fd={fd} lead={lead} onRestart={restart} fmt={fmt} sym={sym} currency={currency} user={user}/>}
      {screen==="history"   && <HistoryScreen user={user} onSelect={handleSelectAudit} onBack={()=>setScreen(fd?"report":"landing")}/>}
      {screen==="history-report" && selectedAudit && (
        <div style={{minHeight:"100vh",padding:"90px 20px 60px",maxWidth:820,margin:"0 auto",position:"relative",zIndex:1}}>
          <button className="btn bo" style={{fontSize:12,padding:"7px 14px",marginBottom:28,gap:6}} onClick={()=>setScreen("history")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Back to History
          </button>
          <p style={{fontSize:10,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--gold)",marginBottom:8,fontFamily:"var(--sans)"}}>Past Audit · {new Date(selectedAudit.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</p>
          <h1 style={{fontSize:"clamp(22px,3.5vw,32px)",color:"var(--t1)",marginBottom:24}}>{INDUSTRY_LABELS[selectedAudit.industry]||"Business"} Audit Report</h1>
          <div className="card-glow" style={{display:"flex",gap:24,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
            <RiskMeter score={selectedAudit.ai_score||50}/>
            <div style={{flex:1,minWidth:200}}>
              <p className="slabel">AI Growth Score</p>
              <div style={{fontSize:14,color:"var(--t2)",fontFamily:"var(--sans)",lineHeight:1.8,marginTop:8}}>Score: <strong style={{color:selectedAudit.ai_score>=68?"var(--green)":selectedAudit.ai_score>=42?"var(--yellow)":"var(--red)"}}>{selectedAudit.ai_score}/100</strong>{selectedAudit.team_size&&<span> · Team: {selectedAudit.team_size}</span>}{selectedAudit.revenue_tier&&<span> · Revenue: {selectedAudit.revenue_tier}</span>}</div>
            </div>
          </div>
          {selectedAudit.ai_report&&<div className="card-accent" style={{marginBottom:16}}><div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16}}><div style={{width:36,height:36,borderRadius:10,background:"rgba(200,169,110,0.12)",border:"1px solid rgba(200,169,110,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>◈</div><div style={{fontWeight:700,fontSize:14,color:"var(--t1)",fontFamily:"var(--sans)"}}>AI Growth Analysis</div></div><div style={{fontSize:14,color:"var(--t2)",lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"var(--sans)"}}>{selectedAudit.ai_report}</div></div>}
          <div className="card-obsidian"><div style={{position:"relative",zIndex:1}}><p style={{fontSize:10,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--gold)",marginBottom:14,fontFamily:"var(--sans)"}}>Ready to act on this?</p><h2 style={{fontSize:"clamp(20px,3vw,28px)",color:"#FAF8F4",marginBottom:12}}>Book Your Free Strategy Call</h2><p style={{color:"rgba(250,248,244,0.5)",fontSize:14,marginBottom:24,fontFamily:"var(--sans)",lineHeight:1.7}}>30 minutes. No commitment. Estate Flow AI specialists.</p><button className="btn-gold" onClick={()=>window.open("https://calendly.com/charanrathod-inf/30min","_blank")} style={{display:"inline-flex",alignItems:"center",gap:10}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Book Strategy Call<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button></div></div>
        </div>
      )}
    </>
  );
}
