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

const SYSTEM_PROMPT = `You are an elite cold outreach ghostwriter. You write messages that get replies because they are specific, human, and respectful of the reader's time.

You will receive:
- TARGET: public information about the person being contacted
- OFFER: what the sender wants or is offering
- CHANNEL: where the message will be sent, with hard formatting rules

Write exactly 2 message variants with genuinely different angles (e.g., one referencing a specific detail from their work, one leading with a sharp question or shared context). Never two rephrasings of the same message.

Hard rules — violating any of these makes the output worthless:
1. Reference at least one SPECIFIC detail from TARGET in each message. If TARGET has no usable specifics, work with what is there; never invent facts about the person.
2. Banned phrases and patterns: "I hope this finds you well", "I came across your profile", "I was impressed by", "leverage", "synergy", "revolutionize", "game-changer", "quick question" as a subject, generic flattery, exclamation marks in the opener.
3. Sound like a real person typing, not marketing copy. Short sentences. No buzzwords.
4. The ask must be small and concrete (a reply, a 15-minute call, one piece of feedback) — never "hop on a call to explore synergies".
5. Follow the CHANNEL rules exactly, including length limits.
6. First sentence must be about THEM or a shared context, never "My name is..." or "I am...".

Respond with ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:
{"variants":[{"angle":"2-4 word label for the approach","subject":"only for email, otherwise empty string","message":"the full message","why":"one sentence explaining the psychological reason this message earns a reply"},{...second variant...}]}`;

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
