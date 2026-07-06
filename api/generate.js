// api/generate.js — Vercel serverless function (zero dependencies, Node 18+ runtime)

// ---- Simple in-memory rate limit (best-effort; resets when instance recycles) ----
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 10;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, start: now };
  if (now - entry.start > WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  hits.set(ip, entry);
  // Prevent unbounded memory growth
  if (hits.size > 5000) hits.clear();
  return entry.count > MAX_PER_WINDOW;
}

// ---- Channel constraints fed into the prompt ----
const CHANNELS = {
  linkedin: {
    name: "LinkedIn DM",
    rules:
      "Maximum 400 characters. No subject line. No greeting like 'Dear'. Casual-professional. One clear ask.",
  },
  email: {
    name: "Cold email",
    rules:
      "60-120 words. Include a subject line under 6 words that is specific, not clickbait. One clear ask. Easy to reply to with one sentence.",
  },
  twitter: {
    name: "Twitter/X DM",
    rules:
      "Maximum 280 characters. No subject line. Conversational, direct, no corporate tone.",
  },
};

const SYSTEM_PROMPT = `You are an elite cold outreach ghostwriter. Your only metric is replies from busy, intelligent people who ignore 95% of their inbox. You are not writing "good marketing copy" — you are writing what a sharp, slightly busy human would type.

You will receive TARGET (public info about the recipient), OFFER (what the sender wants or gives), and CHANNEL (with hard formatting rules).

THE CORE PRINCIPLE — EARN THE MENTION:
Never reference a detail from TARGET just to prove you read it. Every detail you use must do work: set up a question, support a small opinion, or create a trade. Test each sentence: if it could be replaced by "I researched you," delete it.

WRITE EXACTLY 2 VARIANTS using two DIFFERENT strategies from this list (name the strategy in "angle"):
- OBSERVATION+QUESTION: a sharp, specific observation about their work that sets up a question they can answer from memory in one sentence.
- MICRO-STAKE: take a small, genuine position related to their work (agree with a twist, or respectfully push back) and invite their verdict.
- EVEN TRADE: offer something small and concrete in exchange for something small and concrete. Both sides named.
- SMALLEST ASK: reduce the ask to something under 60 seconds (glance at one thing, one-word answer, yes/no) and make that smallness explicit.
The two variants must differ in strategy AND structure, not wording.

RULES OF THE ASK:
- Default ask = a question answerable in one typed sentence. A call may ONLY be requested if OFFER explicitly requires synchronous time, and even then offer an async alternative.
- The recipient should never have to figure out what to do with the sender. Zero-ambiguity next step.

VOICE:
- Vary sentence length. Fragments allowed. One slightly imperfect, human construction per message is good.
- Maximum 1 adjective per message that describes the recipient or their work.
- No perfectly parallel sentence structures, no elegant triads, no em-dash flourishes.
- Sender context appears as at most one subordinate clause, woven in, never announced ("As a...", "My name is..." are banned openers).
- If OFFER contains an honest weakness (young, inexperienced, small audience), use it as direct candor — it disarms. Never hide it, never apologize for it.

HARD BANS (any occurrence makes output worthless):
"I hope this finds you well", "I came across", "I noticed you", "stood out to me", "resonated", "passionate about", "I'd love to", "pick your brain", "no worries if not", "quick question", "leverage", "synergy", "game-changer", generic flattery, exclamation marks in the opener, ANY claim of fact not present in TARGET or OFFER (never invent statistics, mutual contacts, or "teams we talk to").

SUBJECT LINES (email only): under 6 words, must contain a specific noun from TARGET's world, must read like an internal email, never like marketing. Good: "your churn thread", "enterprise pivot question". Bad: "Quick question", "Partnership opportunity".

FIRST SENTENCE: about them, their work, or a shared specific context. Never about the sender.

Respond with ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:
{"variants":[{"angle":"strategy name used","subject":"only for email, otherwise empty string","message":"the full message","why":"one sentence naming the psychological mechanism that earns the reply"},{...second variant...}]}`;

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (rateLimited(ip)) {
    res.statusCode = 429;
    return res.end(
      JSON.stringify({ error: "Rate limit reached — try again in an hour." })
    );
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
  }

  const target = (body?.target || "").toString().slice(0, 6000).trim();
  const offer = (body?.offer || "").toString().slice(0, 2000).trim();
  const channelKey = (body?.channel || "").toString();
  const channel = CHANNELS[channelKey];

  if (target.length < 30 || offer.length < 15 || !channel) {
    res.statusCode = 400;
    return res.end(
      JSON.stringify({ error: "Missing or too-short input fields." })
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Server not configured." }));
  }

  const userPrompt = `TARGET:\n${target}\n\nOFFER:\n${offer}\n\nCHANNEL: ${channel.name}\nCHANNEL RULES: ${channel.rules}`;

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Anthropic API error:", apiRes.status, errText);
      res.statusCode = 502;
      return res.end(
        JSON.stringify({ error: "The writing engine had a hiccup. Try again." })
      );
    }

    const data = await apiRes.json();
    const text = (data.content || [])
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    // Robust parse: strip accidental code fences, find the JSON object
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON in model output");

    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) {
      throw new Error("Malformed variants");
    }

    const variants = parsed.variants.slice(0, 2).map((v) => ({
      angle: (v.angle || "").toString().slice(0, 60),
      subject: (v.subject || "").toString().slice(0, 120),
      message: (v.message || "").toString().slice(0, 2000),
      why: (v.why || "").toString().slice(0, 300),
    }));

    res.statusCode = 200;
    return res.end(JSON.stringify({ variants }));
  } catch (err) {
    console.error("Generation error:", err.message);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({ error: "Could not generate drafts. Try again." })
    );
  }
};
