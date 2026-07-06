[README.md](https://github.com/user-attachments/files/29707092/README.md)
# first-ping# Cold Outreach Personalizer ✈️

**First lines that get replies.** Paste your target's public info (LinkedIn bio, website text) and what you're offering — get two personalized outreach messages that don't sound like AI.

**Live:** _coming soon_ <!-- replace with your URL after deploy -->Live: https://first-ping-pi.vercel.app/ 

## Why

Most cold outreach fails in the first sentence. Generic templates get ignored; good personalization takes 15 minutes per message. This tool compresses that to 15 seconds while keeping the message specific, human, and honest.

## How it works

1. **To** — paste who you're writing to (their bio, About section, or site copy)
2. **From** — say what you actually want (a call, feedback, a job, a sale)
3. **Via** — pick the channel (LinkedIn DM · cold email · X DM)
4. Get **two drafts with different angles**, each with a one-line note on why it should earn a reply

The engine enforces hard rules: no "I hope this finds you well," no invented facts about the recipient, no buzzwords, small concrete asks only, channel-appropriate length limits.

## Stack

- **Front end:** single-file HTML/CSS/vanilla JS — no framework, no build step
- **Back end:** one Vercel serverless function (`api/generate.js`), zero dependencies
- **AI:** Anthropic Claude (Haiku) with a heavily engineered system prompt — the prompt *is* the product
- **Hosting:** Vercel, auto-deployed from this repo

## Roadmap

- [ ] Tone presets (formal / casual / bold)
- [ ] Follow-up sequence generator
- [ ] Persistent rate limiting
- [ ] Paid tier

## Author

Built in a weekend by **Karina** — 18, learning to ship products with AI. Copywriting-first, code-assisted.
