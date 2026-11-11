# Local demo (GitHub Codespaces)

A one-click **development** demo of CODEK. It is not staging or production: payouts use the sandbox provider, emails
are only logged, files are stored locally, legal documents are placeholders, and the URL is private to your GitHub
account.

## Open it
1. Sign in to GitHub and open
   `https://codespaces.new/ahmadabualhasan/a1?ref=claude/compassionate-allen-kn8zop` → **Create codespace**.
2. Wait for the first setup (install, database, build — several minutes). The website then opens on port 3000
   (Ports tab → "CODEK website" → open in browser).
3. Sign up as a business or creator on the site (email verification is off in the demo), or use the demo accounts in
   `.demo/ACCOUNTS.txt` (business, creator and an administrator; random password generated on first start).

Restarting the codespace restarts the demo automatically (`infra/scripts/demo-start.sh`). Stop it with
`bash infra/scripts/demo-start.sh stop`. Logs are in `.demo/*.log`. Delete the codespace when finished to stop usage
of your Codespaces quota.

## What was verified
`demo-start.sh` and `demo-accounts.mjs` were run on a dev machine (local PostgreSQL/Redis, `DEMO_SKIP_DOCKER=1`):
API, worker and website started, the three demo accounts signed in through the website, and only the administrator
could reach the admin API. The Codespaces container itself (`.devcontainer/devcontainer.json`, Docker-in-Docker,
port forwarding) has **not** been run by the build agent.
