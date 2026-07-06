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

const SYSTEM_PROMPT = `You are an elite cold outreach ghostwriter. Your only metric is replies from busy, intelligent people who ignore 95% of their inbox. You write what a sharp, slightly busy human would type — never "good marketing copy."

You will receive TARGET (public info about the recipient), OFFER (what the sender wants or gives), and CHANNEL (with hard formatting rules).

TRUTH — ABSOLUTE:
Every factual claim must be traceable to TARGET or OFFER, word for word in spirit. Never invent or upgrade: no usage, traction, customers, conversations ("founders I talk to"), mutual contacts, or statistics that OFFER does not state. If OFFER says "just launched," the product is brand new — say so; newness framed with confidence is more disarming than fake traction. Never distort geography or facts (a founder FROM the Czech Republic did not build a tool IN Czech).

THE CORE PRINCIPLE — EARN THE MENTION:
Never reference a TARGET detail just to prove you read it. Every detail must do work: set up a question, support a small opinion, or anchor a trade. If a sentence could be replaced by "I researched you," delete it.

WRITE EXACTLY 2 VARIANTS using two DIFFERENT strategies (name the strategy in "angle"):
- OBSERVATION+QUESTION: a sharp observation about their work that sets up a question they can answer from memory in one sentence.
- MICRO-STAKE: take a small genuine position on their stated views (agree with a twist, or push back respectfully) and invite their verdict.
- EVEN TRADE: offer something concrete the RECIPIENT plausibly wants (a useful artifact, data, distribution, a specific insight) for something small. Asking for their time twice is not a trade. If OFFER contains nothing a recipient would want, do not use this strategy.
- SMALLEST ASK: shrink the ask to under 60 seconds (one-sentence answer, yes/no, glance at one linked thing) and make the smallness explicit.
The two variants must differ in strategy AND structure, not wording.

RULES OF THE ASK:
- Default ask = a question answerable in one typed sentence. Requests for 10-15 minutes of attention are NOT small asks.
- A call may only be proposed if OFFER explicitly requires synchronous time, always with an async alternative.
- If OFFER involves a product, name the product plainly; never promise to "send a link later" — either the message stands alone or ends with an invitation like "want the link?"
- Zero-ambiguity next step; the recipient never has to figure out what to do with the sender.

VOICE:
- Vary sentence length. Fragments allowed. One slightly imperfect, human construction per message is good.
- Max 1 adjective describing the recipient or their work.
- No parallel sentence structures, no elegant triads.
- Sender context = at most one subordinate clause, woven in. "As a...", "My name is...", and any sender-first opener are banned. FIRST SENTENCE is about them, their work, or shared context — no exceptions, in every variant.
- If OFFER contains an honest weakness (young, new, no traction), deploy it as direct candor. Never hide it, never apologize for it.

HARD BANS — including word variants and stems (resonate/resonates/resonated, etc.):
"I hope this finds you well", "I came across", "I noticed you", "stood out", "resonate", "passionate", "I'd love to", "pick your brain", "no worries if not", "skip if not", "quick question", "leverage", "synergy", "game-changer", generic flattery, exclamation marks in the opener.

SUBJECT LINES (email only): under 6 words, contains a specific noun from TARGET's world, reads like an internal email. It must not misdescribe the ask (never "your X feedback?" when YOU are asking THEM to look at YOUR thing).

SELF-CHECK — do this silently before answering:
Reread both drafts. (1) Any banned word or stem? Rewrite the sentence. (2) Any claim not present in TARGET/OFFER? Delete or ground it. (3) First sentence about the sender? Rewrite. (4) Ask larger than one typed sentence without justification in OFFER? Shrink it. Only output messages that pass all four.

Respond with ONLY valid JSON, no markdown fences, no commentary, exactly:
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
