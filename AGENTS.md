<!-- BEGIN swamp managed section - DO NOT EDIT -->
# Project

This repository is managed with [swamp](https://github.com/swamp-club/swamp).

## Rules

1. **Search before you build.** When automating AWS, APIs, or any external service: (a) search community extensions with `swamp extension search <query>` — prefer `@swamp/*` official extensions first, (b) search local/installed types with `swamp model type search <query>`, (c) if a community extension exists, install it with `swamp extension pull <package>` instead of building from scratch, (d) extend an existing type if it covers the domain but lacks the method you need, (e) only create a custom extension model in `extensions/models/` as a last resort. Read `.agents/skills/swamp/SKILL.md` for guidance. The `command/shell` model is ONLY for ad-hoc one-off shell commands, NEVER for wrapping CLI tools or building integrations.
2. **Extend, don't be clever.** When a model covers the domain but lacks the method you need, extend it with `export const extension` — don't bypass it with shell scripts, CLI tools, or multi-step hacks. One method, one purpose. Use `swamp model type describe <type> --json` to check available methods.
3. **Use the data model.** Once data exists in a model (via `lookup`, `start`, `sync`, etc.), reference it with CEL expressions. Don't re-fetch data that's already available.
4. **CEL expressions everywhere.** Wire models together with CEL expressions. Always prefer `data.latest("<name>", "<dataName>").attributes.<field>` over the deprecated `model.<name>.resource.<spec>.<instance>.attributes.<field>` pattern.
5. **Verify before destructive operations.** Always `swamp model get <name> --json` and verify resource IDs before running delete/stop/destroy methods.
6. **Prefer fan-out methods over loops.** When operating on multiple targets, use a single method that handles all targets internally (factory pattern) rather than looping N separate `swamp model method run` calls against the same model. Multiple parallel calls against the same model contend on the per-model lock, causing timeouts. A single fan-out method acquires the lock once and produces all outputs in one execution. Check `swamp model type describe` for methods that accept filters or produce multiple outputs.
7. **Extension npm deps are bundled, not lockfile-tracked.** Swamp's bundler inlines all npm packages (except zod) into extension bundles at bundle time. `deno.lock` and `package.json` do NOT cover extension model dependencies — this is by design. Always pin explicit versions in `npm:` import specifiers (e.g., `npm:lodash-es@4.17.21`).
8. **Reports for reusable data pipelines.** When the task involves building a repeatable pipeline to transform, aggregate, or analyze model output (security reports, cost analysis, compliance checks, summaries), create a report extension. Read `.agents/skills/swamp/SKILL.md` for guidance.
9. **"Workflow" means a swamp workflow.** In this repository the word "workflow" (and "create/run/execute/validate/debug workflow", "automate", "orchestrate", "automated/nightly job") refers to a swamp workflow — a declarative YAML DAG of model-method steps authored via `swamp workflow create`. Read `.agents/skills/swamp/SKILL.md` for these requests. Do NOT interpret these as a request to build an agent task list, spin up worktrees, or schedule a cron/remote agent. Only use those orchestration mechanisms when the user explicitly names one (e.g. "task list", "subagent", "worktree", "cron", "remote agent") or explicitly asks you to do the work yourself step by step rather than author a swamp workflow.

## Skills

**IMPORTANT:** Skills are detailed guides stored in `.agents/skills/`. When a task
matches a skill area below, read the corresponding `SKILL.md` file for guidance.

- `.agents/skills/swamp/SKILL.md` - Swamp CLI — models, workflows, data, vaults, extensions, publishing, repos, reports, issues, and troubleshooting
- `.agents/skills/swamp-getting-started/SKILL.md` - Interactive onboarding for new swamp users

## Getting Started

**IMPORTANT:** At the start of every conversation, run
`swamp model search --json`. If no models are returned (empty result), you MUST
immediately read `.agents/skills/swamp-getting-started/SKILL.md` and follow its
instructions. This walks new users through an interactive onboarding tutorial.

If models already exist, start by reading `.agents/skills/swamp/SKILL.md`
to work with swamp models.

## Commands

Use `swamp --help` to see available commands. For a machine-readable JSON
schema of the CLI (commands, options, arguments) intended for agent
consumption, run `swamp help [<command>...]` — e.g. `swamp help` returns
the full tree, and `swamp help model method run` scopes to a subtree.
<!-- END swamp managed section -->

# alvagante.com Site Instructions

## Site Shape

This repository is a GitHub Pages Jekyll site for `alvagante.com`. It serves a compact personal dashboard with curated links and daily AI-assisted news digests. Keep public site data local-first and file-backed; do not add a backend, database, accounts, comments, or admin UI unless explicitly requested.

Canonical public data lives under `_data/`:

- `_data/links/<topic>/<category>.yml` - curated directory entries grouped by topic and category.
- `_data/sources/<category>.yml` - RSS/Atom sources used by the news digest, grouped by news category.
- `_data/generated/news/YYYY-MM-DD.yml` - generated daily digest files consumed by the Jekyll pages.

Primary site files are:

- `index.md`, `links.md`, `news.md`, `about.md` for top-level pages.
- `_layouts/default.html` and `_includes/` for Liquid templates.
- `assets/css/site.css`, `assets/js/filters.js`, and `assets/img/` for frontend assets.

Avoid custom Jekyll plugins; this site should stay compatible with GitHub Pages and the `github-pages` gem.

## Docker-First Local Development

Use Docker for all Jekyll testing. Do not require host Ruby, Bundler, or Jekyll.

Start or refresh the local site service:

```bash
docker compose up jekyll
```

Run it in the background:

```bash
docker compose up -d jekyll
```

Stop it:

```bash
docker compose down
```

Run a one-off build check:

```bash
docker compose run --rm jekyll bundle exec jekyll build
```

The Jekyll service must listen on an external interface because development happens on a remote node. `docker-compose.yml` publishes:

- `0.0.0.0:4000:4000` for the site.
- `0.0.0.0:35729:35729` for LiveReload.

Jekyll itself must be started with `--host 0.0.0.0`. Access the site at `http://<remote-host>:4000/`, not only `localhost`.

The Compose service uses a named `bundle-cache` volume for gem installs and runs incremental Jekyll rebuilds for faster checks. Generated Jekyll artifacts such as `_site/`, `.jekyll-cache/`, `.jekyll-metadata`, `.bundle/`, `vendor/bundle/`, and `Gemfile.lock` are local artifacts and should not be committed.

## Swamp Automation

The local swamp extension is `@alvagante/site-curation` in `extensions/models/site_curation.ts`, registered by `manifest.yaml`. It is intentionally a fan-out model: fetch all enabled feeds and build the digest in one method run rather than looping separate model calls.

The configured model is named `site-curation` and lives under `models/@alvagante/site-curation/`. Preserve swamp-assigned IDs in model YAML.

Useful commands:

```bash
swamp extension source add . --only models
swamp extension fmt manifest.yaml --check
swamp doctor extensions --json
swamp model validate site-curation --json
swamp model method run site-curation build_daily_digest
swamp workflow validate daily-news --json
swamp workflow run daily-news
```

The `daily-news` workflow calls `site-curation.build_daily_digest`, writes `_data/generated/news/YYYY-MM-DD.yml`, and stores a swamp data resource for the same digest. Preserve the workflow ID in `workflows/workflow-*.yaml`; create new workflows only with `swamp workflow create <name> --json` before editing.

The model can run without an OpenAI key by using feed excerpts. For AI enrichment, provide `OPENAI_API_KEY` through a swamp vault, environment variable, or GitHub Actions secret. Never commit API keys or put them directly in model YAML.

## AI Engineering Media Production

The AI Engineering section is generated through the `media-production` swamp workflow. Use this workflow to create content about AI-related fields and professions across the configured media formats: blog posts, slides, notebooks, cheat sheets, infographics, social posts, podcasts, videos, and memes.

Use `_data/ai_engineering_topics.yml` as the topic source for this workflow. The file contains only topic titles, grouped by AI field, so workflow inputs can be selected without extra parsing or editorial metadata. Keep the list broad enough to cover relevant AI professions and domains, but avoid near-duplicate topics that would produce overlapping media batches.

When adding topics:

- Add topic titles under the closest existing AI field before creating a new field.
- Prefer durable engineering topics over short-lived vendor announcements.
- Keep titles concise, concrete, and suitable as direct workflow input.
- Do not add descriptions, URLs, prompts, or generation status to the topic file unless the workflow is explicitly changed to consume them.

## GitHub Actions

`.github/workflows/pages.yml` handles build, optional digest generation, committing generated digest changes, and Pages deployment. It runs on:

- `push` to `main`.
- `workflow_dispatch`, with `generate_digest` set to `true` when a manual digest run is needed.
- Daily schedule at a non-top-of-hour cron.

Keep GitHub Pages deployment plugin-free and static. If the Actions workflow changes, make sure it still builds Jekyll with Bundler and preserves `OPENAI_API_KEY` as a secret-only value.

## Verification Before Handoff

For site/template changes, run:

```bash
docker compose run --rm jekyll bundle exec jekyll build
```

For Docker service changes, run:

```bash
docker compose config
docker compose up -d jekyll
docker compose ps
```

Confirm `docker compose ps` shows `0.0.0.0:4000->4000/tcp`.

For swamp extension/model/workflow changes, run the relevant swamp validation commands above and then run `swamp workflow run daily-news` when feed/network access is available.

## Editing Guidelines

- Treat `_data/links/<topic>/<category>.yml` and `_data/sources/<category>.yml` as hand-curated source data.
- Treat `_data/generated/news/*.yml` as generated but commit-worthy site content.
- Keep frontend UI compact and dashboard-like; avoid landing-page hero bloat.
- Keep Liquid simple and GitHub Pages compatible.
- Do not edit the swamp-managed section at the top of this file.
