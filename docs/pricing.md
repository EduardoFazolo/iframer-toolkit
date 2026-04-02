# Pricing Model

## Business Model

Open source software, paid hosted service. The code is 100% open source — anyone can self-host. We charge for infrastructure so users don't have to manage servers, Redis, browser containers, scaling, etc.

## Plans

### Starter — $5/mo

Generous limits designed so normal agentic users never hit them:

| Resource | Limit |
|----------|-------|
| Headless fetches | 50,000/mo |
| Interactive session time | 2,000 min/mo (~33 hours) |
| Concurrent interactive sessions | 10 |
| Session storage | 10MB |
| Screenshots | Unlimited |

**Cost analysis at max usage:**
- 50,000 fetches × $0.0001 = $5.00
- 2,000 min × $0.002/min = $4.00
- Total worst case: ~$9.00 (slight loss)

**Cost analysis for realistic heavy agentic user (90th percentile):**
- 15,000 fetches × $0.0001 = $1.50
- 300 min interactive × $0.002 = $0.60
- Total: ~$2.10
- **Profit: ~$2.90/user/mo**

**Cost analysis for typical user:**
- 500 fetches × $0.0001 = $0.05
- 30 min interactive × $0.002 = $0.06
- Total: ~$0.11
- **Profit: ~$4.89/user/mo**

### Pay-as-you-go

Starts with $5 in credits. Top up as needed. For users who want no caps or are building products on top.

| Operation | Price | Our cost | Margin |
|-----------|-------|----------|--------|
| Headless fetch | $0.001 | ~$0.0001 | 10x |
| Interactive session (per min) | $0.01 | ~$0.002 | 5x |
| Screenshot | $0.0005 | ~$0.00005 | 10x |
| Session storage (per month) | $0.10 | ~$0.01 | 10x |

Margins are healthy but not predatory. A user doing the same work on pay-as-you-go as on the starter plan would pay roughly the same amount.

## Cost Structure

### Infrastructure costs (shared server model)

| Component | Cost |
|-----------|------|
| Hetzner CCX23 (16GB, 4 vCPU) | ~$25/mo |
| Managed Redis (or self-hosted) | ~$5-10/mo |
| Total | ~$30-35/mo |

Supports ~100 concurrent users, ~1,000+ registered users (since sessions are ephemeral — container spins up on request, dies after).

**Per-user infra cost at 1,000 users: ~$0.03/mo**

### Per-operation costs

| Operation | What happens | Cost driver |
|-----------|-------------|-------------|
| Headless fetch | Shared Chromium context, ~2s, ~5MB | Negligible — shared browser |
| Interactive start | Xvfb + x11vnc + websockify + Chromium | ~200MB RAM, runs only while active |
| Interactive act | Playwright action on existing session | Negligible — reuses existing session |
| Screenshot | PNG capture | Negligible |

### What we DON'T pay for

The AI API calls (Claude/GPT analyzing screenshots, deciding which tiles to click) are billed to the **user's own API key**. The MCP server runs on their side. We never see or pay for their AI usage.

This is the key insight: our most expensive-looking feature (CAPTCHA solving with vision AI) costs us $0 because the intelligence runs on the user's machine.

## Scaling Economics

| Users | Infra cost | Revenue ($5/mo) | Profit |
|-------|-----------|-----------------|--------|
| 100 | ~$35/mo | $500/mo | $465/mo |
| 1,000 | ~$70/mo (2 servers) | $5,000/mo | $4,930/mo |
| 10,000 | ~$500/mo (cluster) | $50,000/mo | $49,500/mo |

## Key Decisions

1. **No feature gating** — Open source gets everything. Paid = hosted infrastructure.
2. **Generous starter plan** — Most users never think about limits.
3. **Pay-as-you-go for power users** — No artificial caps, fair pricing.
4. **AI costs are user-side** — We provide the browser, they provide the brain.
5. **5x-10x margins on pay-as-you-go** — Healthy but not exploitative.

## Agentic Usage Patterns

A single agent task like "solve CAPTCHA and submit form" generates:
- ~7 API calls
- ~1-2 minutes of interactive time
- Cost to us: ~$0.004

A complex task like "log into a site, navigate, extract data" generates:
- ~30-50 API calls
- ~1-5 minutes of interactive time (only for CAPTCHAs/2FA)
- Rest is headless (cheap)
- Cost to us: ~$0.01-0.02

Agents naturally minimize interactive time because they only use it when they need vision. Most browsing is headless.

## Future Considerations

- **Geographic proxies** — premium feature, residential IPs in US/EU/Asia
- **Premium browser profiles** — anti-detection fingerprints
- **Team plans** — shared sessions, multiple users per org
- **SLA tiers** — guaranteed uptime for enterprise
- **Billing integration** — Stripe, usage tracking per user
