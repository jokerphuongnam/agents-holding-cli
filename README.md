# agents-holding

Set up a small company and ship with it. A CEO talks to you. An engineer builds the plan. Plans live in `cache/plans/`.

```bash
git clone https://github.com/jokerphuongnam/agents-holding-free.git
cd agents-holding-free
./setup.sh my-product
```

That writes `./.agents/my-product-company/`. Open `system/staffs/leadership/ceo.md` in your agent and describe what you want built.

This is the free company: two people, one plan, one build. The full edition adds a product desk, QC, a skill library, plan history, child companies, and the Mac app.

## Full version (license key)

Got a license key (`ah_live_...`)? Install the full version on your Mac with one line:

```bash
curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/main/full/install.sh | bash
```

Then follow **[full/SETUP.md](full/SETUP.md)**. The full version runs on a hosted server, which holds all roles, skills and workflow logic. This repo only has the small local client: the Jira listener and the setup scripts.
