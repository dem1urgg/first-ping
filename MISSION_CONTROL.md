[MISSION_CONTROL.md](https://github.com/user-attachments/files/29707133/MISSION_CONTROL.md)
# MISSION CONTROL — 48h Sprint
> Paste this entire file into any AI chat to restore full project context.
> Update the STATUS and LOG sections after every work block. This file is the project's memory.

## OPERATOR
Karina, 18. Strengths: copywriting (8.5), marketing (7), design (6). Coding 2/10 — AI-assisted only.
Failure pattern to guard against: scope creep, perfectionism. Rule: ship ugly, iterate later.
Hardware: 2012 Mac (browser-only workflow — GitHub web editor + Vercel, no local tooling).

## MISSION
Ship a live AI micro-tool + reusable AI operating system + public launch in 48h (20–25 working hours).

## PRODUCT
**Cold Outreach Personalizer** (working name — final name locked by hour 10)
One job: paste a target's public info (LinkedIn bio / website text) + your offer → get a personalized cold outreach message that doesn't sound like AI.
Moat: prompt engineering + copywriting quality, not code.
v1 scope (FROZEN — additions go to BACKLOG, not into v1):
- One page: two text inputs (target info, your offer/goal), one dropdown (channel: LinkedIn DM / email / Twitter DM), Generate button
- Output: 2 message variants + one-line "why this works" note
- Serverless function holds API key, calls Claude Haiku, basic per-IP rate limit
- No accounts, no database, no payments

## ARCHITECTURE
- Front end: single `index.html` (HTML/CSS/vanilla JS)
- Back end: `api/generate.js` — Vercel serverless function, key in env var `ANTHROPIC_API_KEY`
- Hosting: Vercel, auto-deploys from GitHub main branch
- Cost: ~€5 API credits, ~€10 domain

## ROADMAP & STATUS
- [x] H0–1: Accounts (GitHub, Vercel, Anthropic) ✅
- [ ] H1–5: Build v1 — repo files, deploy to Vercel, first successful generation
- [ ] H5–9: Prompt engineering — iterate the system prompt against 5 real test cases until output beats what Karina writes manually
- [ ] H9–10: Lock name, buy domain, connect to Vercel
- [ ] H10–13: Polish pass — design, mobile check, error states, rate limit
- [ ] H13–18: Karina OS — prompt library, playbook, this doc finalized
- [ ] H18–22: Launch — portfolio one-pager, case study, LinkedIn post PUBLISHED
- [ ] H22–25: Buffer / first user feedback fixes

## BACKLOG (post-weekend, do NOT build now)
Tone presets · follow-up sequence generator · Chrome extension · paid tier · user accounts

## DECISIONS LOG
- Product chosen by 25-point scoring across 15 ideas; #1 scored 23/25
- BYOK rejected: kills demo value. Own API key + rate limit instead
- Zero local tooling: Node not installed, Mac is old — browser-only stack
- Domain purchase deferred to hour ~10, hard deadline

## WORK LOG
<!-- After each session add: date/hour · what shipped · next action -->
- H1: Accounts ready. Next: create repo files.

## NEXT ACTION
Create the 3 v1 files in GitHub web editor, connect repo to Vercel, add API key env var, deploy.
