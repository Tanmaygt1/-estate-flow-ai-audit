// app/api/analyze/route.js
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req) {
  try {
    const { prompt, score, currency, businessName, email } = await req.json();
    if (!prompt) return NextResponse.json({ error: "No prompt" }, { status: 400 });

    const system = `You are a senior AI business growth consultant at Estate Flow AI.
You specialise in businesses that acquire leads through social media reels and video content.
Write sharp, specific, data-driven analysis. Reference actual numbers from the data. No filler.
Write in second person. Keep paragraphs punchy — 3–5 sentences, maximum impact.`;

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: "grok-3-fast-beta",
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        max_tokens: 900,
        temperature: 0.72,
      }),
    });

    if (!res.ok) {
      const e = await res.text();
      console.error("Grok error:", e);
      return NextResponse.json({ error: "AI failed" }, { status: 500 });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    return NextResponse.json({ text, score, currency });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
