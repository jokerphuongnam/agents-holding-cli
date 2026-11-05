# agents-holding pricing (credits)

Languages: **English** · [Tiếng Việt](localized/PRICING.vi.md) · [日本語](localized/PRICING.ja.md) · [한국어](localized/PRICING.ko.md) · [简体中文](localized/PRICING.zh-CN.md) · [Español](localized/PRICING.es.md) · [Français](localized/PRICING.fr.md) · [Deutsch](localized/PRICING.de.md)

Credit plans, limits, what each action costs and how to upgrade. There is no in-app payment: to upgrade, contact the owner with your **key id**.

Check your plan on your machine: `holding billing` · `holding usage` · `holding key show` (shows the key id only, never the secret).

---

## Credit plans (monthly)

| Plan | Credits / month | Price | Channel |
|---|---:|---:|---|
| free | 1,500 | $0 | direct |
| starter | 4,000 | $2 | direct |
| lite | 6,000 | $2.5 | direct |
| pro | 20,000 | $7.5 | direct |
| power | 80,000 | $25 | direct |
| max | 180,000 | $50 | direct |
| ultra | 300,000 | $75 | direct |
| marketplace | 20,000 | $10 | marketplace |
| enterprise | custom | contact us | contact the owner |

- Only **metered** keys (keys with a credit plan) use credits. Older keys without metering keep working as before.
- **enterprise**: credits, seats and devices by agreement. **Contact** the owner.
- marketplace plan: bought through the marketplace. For order details, **contact** the owner.

---

## Staff limit (per company)

The maximum number of staff in one company's roster, CEO included. It applies when you add, move or assign staff, migrate, or create a new company. The owner key has no limit.

| Plan | Max staff / company |
|---|---:|
| free | 5 |
| starter | 10 |
| lite | 15 |
| pro | 25 |
| marketplace | 25 |
| power | 40 |
| max | 60 |
| ultra | unlimited |
| enterprise | unlimited |

Older keys **without** a credit plan: trial 20 · monthly 30 · yearly 50 · otherwise 30.

At the limit you see: *"You have reached the N-staff limit of plan X. Fire a staff member first or upgrade your plan."*

---

## Device limit (machines)

| Item | Value |
|---|---|
| Default per key | **1** device |
| Most the owner can assign | **1 to 50** devices per key |
| Free key created on a machine | **one** Free key per machine |
| enterprise | devices per key by agreement: **contact** us |

Out of device slots? Ask the owner to raise your device limit, then try again on the new machine. `holding key show` shows devices used/max.

---

## Credit cost per action

Only the actions below, which create work, cost credits. Everything else (heartbeat, realtime sync, status, billing, inbox list, key, admin, most CLI commands) is **free**.

| Action | Credits |
|---|---:|
| Agent run (`next_action`) | **2** |
| `advance` | 1 |
| `jira_ops` | 1 |
| `staff_brief` | 1 |
| `record_artifact` | 1 |
| `assign` (including `holding task set …`) | 1 |
| `ceo` | 1 |
| `inbox_post` / `inbox_reply` | 1 |

**Model tokens are never charged in credits.**

### Uploads (Jira attach / Figma export / Confluence)

**1 credit per file, plus 1 credit for every 10 MB beyond the first 5 MB**, **capped at 5 credits per file**.

Examples: 0.4 MB → 1 · 25 MB → 3 · 300 MB → 5.

Files go straight from your machine to Jira, Confluence or Figma; the server only measures the size to count credits.

---

## Upgrade or add credits

1. Get your **key id** (never send the secret key): `holding key show`, or the "To upgrade" line in `holding billing` / `holding usage`.
2. Send the key id to the **owner** (**phuongnamp99@gmail.com**) with the plan you want, or how many extra credits you need this period.
3. **There is no in-app payment yet.** When payments arrive, upgrading will plug into the same flow; this price sheet stays the place to look.

Out of credits or key expired: the Jira Listener stops and tells you to contact the owner to renew or add credits.

---

## Quick lookup on your machine

```bash
holding billing          # current plan + price sheet + upgrade line
holding usage            # credit bar for this period (metered keys)
holding credit show      # credit balance
holding key show         # key id, plan, devices
```

Install / MCP: [full/SETUP.md](../full/SETUP.md).
