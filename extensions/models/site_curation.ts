/**
 * Curates links and feed items for the alvagante.com Jekyll site.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { parse as parseYaml, stringify as stringifyYaml } from "npm:yaml@2.7.0";
import { XMLParser } from "npm:fast-xml-parser@4.5.1";

const LinkSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  description: z.string().default(""),
  topic: z.string().default("General"),
  category: z.string().default("General"),
  section: z.string().default("General"),
  tags: z.array(z.string()).default([]),
  audience: z.string().default("readers"),
  pricing: z.string().default("unknown"),
  logo: z.string().nullish(),
  favicon: z.string().nullish(),
  sublinks: z.array(z.object({ title: z.string(), url: z.string().url() }))
    .default([]),
  notes: z.string().nullish(),
  last_checked: z.string().nullish(),
});

type Link = z.infer<typeof LinkSchema>;

const SourceSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  topic: z.string().default("General"),
  category: z.string().default("General"),
  section: z.string().default("General"),
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  importance_bias: z.number().default(1),
  favicon: z.string().nullish(),
});

const NewsItemSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  source: z.string(),
  source_favicon: z.string().nullish(),
  image: z.string().nullish(),
  summary: z.string(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  relevance: z.number().min(0).max(1),
  published_at: z.string(),
});

const DigestSchema = z.object({
  date: z.string(),
  generated_at: z.string(),
  items: z.array(NewsItemSchema),
});

const GlobalArgsSchema = z.object({
  repoDir: z.string().default("."),
  linksPath: z.string().default("_data/links"),
  newsSourcesPath: z.string().default("_data/sources"),
  generatedNewsDir: z.string().default("_data/generated/news"),
  rssPath: z.string().default("rss.xml"),
  siteUrl: z.string().url().default("https://alvagante.com"),
  openaiModel: z.string().default("gpt-5.4-mini"),
  openaiApiKey: z.string().optional(),
  ollamaBaseUrl: z.string().default("http://localhost:11434"),
  ollamaModel: z.string().optional(),
  feedFetchTimeoutMs: z.number().int().positive().default(20000),
  feedFetchConcurrency: z.number().int().positive().default(24),
  aiRequestTimeoutMs: z.number().int().positive().default(600000),
  maxItemsPerSource: z.number().int().positive().default(8),
  feedSelectionMode: z.enum(["lookback_days", "latest_per_source"]).default(
    "latest_per_source",
  ),
  newsLookbackDays: z.number().int().positive().default(2),
  latestItemsPerSource: z.number().int().positive().default(5),
  maxDigestItems: z.number().int().positive().default(500),
});

const FetchFeedsArgsSchema = z.object({
  maxItemsPerSource: z.number().int().positive().optional(),
  feedFetchTimeoutMs: z.number().int().positive().optional(),
});

const BuildDigestArgsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  writeFile: z.boolean().default(true),
  writeRss: z.boolean().default(true),
  maxItems: z.number().int().positive().optional(),
  feedSelectionMode: z.enum(["lookback_days", "latest_per_source"]).optional(),
  newsLookbackDays: z.number().int().positive().optional(),
  latestItemsPerSource: z.number().int().positive().optional(),
  maxItemsPerSource: z.number().int().positive().optional(),
  feedFetchTimeoutMs: z.number().int().positive().optional(),
  aiRequestTimeoutMs: z.number().int().positive().optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
});

const EnrichLinkMetadataArgsSchema = z.object({
  /** Skip writing files — useful for previewing what would change. */
  dryRun: z.boolean().default(false),
  /** Limit enrichment to specific topic subdirectories (e.g. ["ai", "security"]). */
  topics: z.array(z.string()).optional(),
  /** Phase 1: AI-inferred descriptions, pricing, and audience. */
  phase1: z.boolean().default(true),
  /** Phase 2: Upstream HTML fetch for og:image (logo) and meta description hint. */
  phase2: z.boolean().default(true),
  /** Phase 3: AI-suggested canonical sublinks (docs, GitHub, pricing). */
  phase3: z.boolean().default(true),
  /** Description shorter than this (chars) is considered terse and will be rewritten. */
  descriptionMinLength: z.number().int().positive().default(80),
  /** Links per AI batch call. */
  batchSize: z.number().int().positive().default(25),
  /** Max parallel HTTP fetches for Phase 2. */
  concurrency: z.number().int().positive().default(8),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
  /** Re-enrich even entries that already appear complete. */
  forceReenrich: z.boolean().default(false),
});

const MediaKindSchema = z.enum([
  "blog-post",
  "social-posts",
  "cheatsheet",
  "infographic",
  "short-video",
  "podcast",
  "slides",
  "notebook",
  "meme",
]);

const MediaGenerationArgsSchema = z.object({
  topic: z.string().default("AI engineering field notes"),
  title: z.string().optional(),
  source: z.string().default("daily digest and curated site links"),
  style: z.string().default("alfabot"),
  mode: z.string().default("standalone"),
  dryRun: z.boolean().default(false),
  writeFile: z.boolean().default(true),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
});

type Source = z.infer<typeof SourceSchema>;
type NewsItem = z.infer<typeof NewsItemSchema>;
type MediaKind = z.infer<typeof MediaKindSchema>;
type MediaGenerationArgs = z.infer<typeof MediaGenerationArgsSchema>;

interface SiteMetadata {
  ogImage?: string;
  description?: string;
}

interface LinkEnrichInput {
  url: string;
  title: string;
  description: string;
  category: string;
  section: string;
  pricing: string;
  audience: string;
  hasSublinks: boolean;
  ogHint?: string;
  needsDescription: boolean;
  needsPricing: boolean;
  needsSublinks: boolean;
}

interface LinkEnrichOutput {
  url: string;
  description?: string;
  pricing?: string;
  audience?: string;
  sublinks?: Array<{ title: string; url: string }>;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
});

// ─── Core YAML helpers ────────────────────────────────────────────────────────

function pathJoin(...parts: string[]): string {
  return parts.filter(Boolean).join("/").replaceAll(/\/+/g, "/");
}

async function readYamlFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await Deno.readTextFile(path);
    return (parseYaml(raw) ?? fallback) as T;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return fallback;
    throw error;
  }
}

async function readYamlListPath(path: string): Promise<unknown[]> {
  try {
    const stat = await Deno.stat(path);
    if (stat.isFile) return await readYamlFile<unknown[]>(path, []);
    if (!stat.isDirectory) return [];
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }

  const links: unknown[] = [];
  for await (const entry of Deno.readDir(path)) {
    const child = pathJoin(path, entry.name);
    if (entry.isDirectory) {
      links.push(...await readYamlListPath(child));
    } else if (entry.isFile && /\.ya?ml$/.test(entry.name)) {
      links.push(...await readYamlFile<unknown[]>(child, []));
    }
  }
  return links;
}

// ─── General utilities ────────────────────────────────────────────────────────

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "text" in value) {
    return text((value as { text: unknown }).text);
  }
  return "";
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#8217;", "'")
    .replaceAll("&#8216;", "'")
    .replaceAll("&#8220;", '"')
    .replaceAll("&#8221;", '"');
}

function stripHtml(value: string): string {
  return decodeEntities(value)
    .replaceAll(/<script[\s\S]*?<\/script>/gi, "")
    .replaceAll(/<style[\s\S]*?<\/style>/gi, "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function firstLink(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstLink(value[0]);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return text(record.href ?? record["@_href"] ?? record.text);
  }
  return "";
}

function imageFromItem(item: Record<string, unknown>): string | undefined {
  const media = item["media:content"] ?? item.enclosure;
  const candidates = asArray(
    media as Record<string, unknown> | Record<string, unknown>[],
  );
  for (const candidate of candidates) {
    const url = text(candidate.url ?? candidate.href);
    if (url) return url;
  }
  return undefined;
}

function relevanceForItem(source: Source, publishedAt: string): number {
  const published = Date.parse(publishedAt);
  const ageDays = Number.isNaN(published)
    ? 30
    : Math.max(0, (Date.now() - published) / 86400000);
  const recencyPenalty = Math.min(0.6, ageDays * 0.04);
  return Math.max(
    0,
    Math.min(1, source.importance_bias * 0.75 - recencyPenalty),
  );
}

// ─── Feed parsing ─────────────────────────────────────────────────────────────

function parseFeed(xml: string, source: Source, limit: number): NewsItem[] {
  const parsed = xmlParser.parse(xml);
  const channel = parsed?.rss?.channel;
  const atom = parsed?.feed;
  const rawItems = channel ? asArray(channel.item) : asArray(atom?.entry);

  return rawItems.slice(0, limit).map((raw) => {
    const item = raw as Record<string, unknown>;
    const title = stripHtml(text(item.title)) || "Untitled";
    const description = stripHtml(
      text(item.description ?? item.summary ?? item.content),
    );
    const published = text(item.pubDate ?? item.published ?? item.updated) ||
      new Date().toISOString();
    const parsedPublished = Date.parse(published);
    const publishedAt = Number.isNaN(parsedPublished)
      ? new Date().toISOString()
      : new Date(parsedPublished).toISOString();
    const url = firstLink(item.link) || source.url;
    const summary = description.slice(0, 260) ||
      `Latest item from ${source.name}.`;

    return {
      title,
      url,
      source: source.name,
      source_favicon: source.favicon ?? null,
      image: imageFromItem(item) ?? source.favicon ?? null,
      summary,
      category: source.category,
      tags: source.tags,
      relevance: relevanceForItem(source, publishedAt),
      published_at: publishedAt,
    };
  });
}

// ─── News AI enrichment (OpenAI / Ollama) ─────────────────────────────────────

async function callOpenAI(
  apiKey: string,
  model: string,
  items: NewsItem[],
  timeoutMs: number,
): Promise<NewsItem[]> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "Rank and summarize news items for a concise technical daily digest. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({ items }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "daily_digest_items",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    source: { type: "string" },
                    image: { type: ["string", "null"] },
                    summary: { type: "string" },
                    category: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    relevance: { type: "number" },
                    published_at: { type: "string" },
                  },
                  required: [
                    "title",
                    "url",
                    "source",
                    "image",
                    "summary",
                    "category",
                    "tags",
                    "relevance",
                    "published_at",
                  ],
                },
              },
            },
            required: ["items"],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI enrichment failed: ${response.status} ${await response.text()}`,
    );
  }

  const payload = await response.json();
  const textOutput = payload.output_text ??
    payload.output?.flatMap((entry: { content?: Array<{ text?: string }> }) =>
      entry.content ?? []
    )
      .map((content: { text?: string }) => content.text ?? "")
      .join("");
  const parsed = JSON.parse(textOutput);
  return z.object({ items: z.array(NewsItemSchema) }).parse(parsed).items;
}

async function callOllama(
  baseUrl: string,
  model: string,
  items: NewsItem[],
  timeoutMs: number,
): Promise<NewsItem[]> {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Rank and summarize news items for a concise technical daily digest. " +
            "Return a JSON object with a single key 'items' containing an array of news items. " +
            "Each item must have: title, url, source, image (string or null), summary, category, tags (array), relevance (0-1), published_at.",
        },
        {
          role: "user",
          content: JSON.stringify({ items }),
        },
      ],
      response_format: { type: "json_object" },
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama enrichment failed: ${response.status} ${await response.text()}`,
    );
  }

  const payload = await response.json();
  const textOutput: string = payload.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(textOutput);
  return z.object({ items: z.array(NewsItemSchema) }).parse(parsed).items;
}

// ─── Feed selection / filtering ───────────────────────────────────────────────

async function fetchItems(
  repoDir: string,
  globals: z.infer<typeof GlobalArgsSchema>,
  maxItemsPerSource?: number,
  feedFetchTimeoutMs?: number,
): Promise<NewsItem[]> {
  const sourcePath = pathJoin(repoDir, globals.newsSourcesPath);
  const sourcesRaw = await readYamlListPath(sourcePath);
  const sources = z.array(SourceSchema).parse(sourcesRaw).filter((source) =>
    source.enabled
  );
  const limit = maxItemsPerSource ?? globals.maxItemsPerSource;
  const batches = await pMap(sources, async (source) => {
    try {
      const response = await fetch(source.url, {
        headers: {
          "user-agent": "alvagante-site-curation/1.0",
          "accept":
            "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(
          feedFetchTimeoutMs ?? globals.feedFetchTimeoutMs,
        ),
      });
      if (!response.ok) throw new Error(`${response.status}`);
      return parseFeed(await response.text(), source, limit);
    } catch (error) {
      throw new Error(`${source.name}: ${String(error)}`);
    }
  }, globals.feedFetchConcurrency);

  for (const result of batches) {
    if (result.error) {
      console.warn(`feed fetch failed: ${String(result.error)}`);
    }
  }

  return batches.flatMap((result) => result.value ? result.value : []);
}

function rankedItems(items: NewsItem[]): NewsItem[] {
  return items.sort((a, b) =>
    b.relevance - a.relevance ||
    Date.parse(b.published_at) - Date.parse(a.published_at)
  );
}

function itemKey(item: NewsItem): string {
  return item.url || `${item.source}:${item.title}`.toLowerCase();
}

function isPromotionalItem(item: NewsItem): boolean {
  const haystack = `${item.title}\n${item.summary}`.toLowerCase();
  return [
    /\b(?:promo|coupon|discount)\s+codes?\b/,
    /\b(?:promo|coupon|discount)\s+code\b/,
    /\b\d+%\s+off\b.*\b(?:promo|coupon|discount)\b/,
    /\b(?:promo|coupon|discount)\b.*\b\d+%\s+off\b/,
  ].some((pattern) => pattern.test(haystack));
}

function filterPromotionalItems(items: NewsItem[]): NewsItem[] {
  return items.filter((item) => !isPromotionalItem(item));
}

function preserveSourceMetadata(
  items: NewsItem[],
  originals: NewsItem[],
): NewsItem[] {
  const byKey = new Map(originals.map((item) => [itemKey(item), item]));
  return items.map((item) => {
    const original = byKey.get(itemKey(item));
    if (!original) return item;
    return {
      ...item,
      source: original.source,
      source_favicon: item.source_favicon ?? original.source_favicon ?? null,
      category: original.category,
      tags: original.tags,
    };
  });
}

function selectItemsForDigest(
  items: NewsItem[],
  date: string,
  globals: z.infer<typeof GlobalArgsSchema>,
  args: z.infer<typeof BuildDigestArgsSchema>,
): NewsItem[] {
  const mode = args.feedSelectionMode ?? globals.feedSelectionMode;

  if (mode === "latest_per_source") {
    const limit = args.latestItemsPerSource ?? globals.latestItemsPerSource;
    const bySource = new Map<string, NewsItem[]>();
    for (const item of rankedItems([...items])) {
      const group = bySource.get(item.source) ?? [];
      if (group.length < limit) {
        group.push(item);
        bySource.set(item.source, group);
      }
    }
    return [...bySource.values()].flat();
  }

  const lookbackDays = args.newsLookbackDays ?? globals.newsLookbackDays;
  const cutoff = new Date(`${date}T00:00:00Z`).getTime() -
    (lookbackDays - 1) * 86400000;
  return items.filter((item) => {
    const published = Date.parse(item.published_at);
    return !Number.isNaN(published) && published >= cutoff;
  });
}

function sortItems(items: NewsItem[], maxItems: number): NewsItem[] {
  const byUrl = new Map<string, NewsItem>();
  for (const item of items) {
    const key = itemKey(item);
    const current = byUrl.get(key);
    if (!current || item.relevance > current.relevance) {
      byUrl.set(key, item);
    }
  }

  const categoryOrder = [
    "AI",
    "Security",
    "IT",
    "Technology",
    "Science",
    "Geopolitics",
  ];
  const groups = new Map<string, NewsItem[]>();
  for (const item of rankedItems([...byUrl.values()])) {
    const group = groups.get(item.category) ?? [];
    group.push(item);
    groups.set(item.category, group);
  }

  const categories = [...groups.keys()].sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    return (aIndex === -1 ? categoryOrder.length : aIndex) -
        (bIndex === -1 ? categoryOrder.length : bIndex) || a.localeCompare(b);
  });
  const selected: NewsItem[] = [];

  while (selected.length < maxItems && categories.length > 0) {
    let added = false;
    for (const category of categories) {
      const next = groups.get(category)?.shift();
      if (!next) continue;
      selected.push(next);
      added = true;
      if (selected.length >= maxItems) break;
    }
    if (!added) break;
  }

  return selected;
}

// ─── RSS rendering ────────────────────────────────────────────────────────────

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function absoluteUrl(url: string, siteUrl: string): string {
  return new URL(url, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`).href;
}

function rfc822Date(value: string): string {
  const parsed = Date.parse(value);
  return new Date(Number.isNaN(parsed) ? value : parsed).toUTCString();
}

function directoryName(path: string): string {
  const normalized = path.replaceAll(/\/+$/g, "");
  const slash = normalized.lastIndexOf("/");
  return slash === -1 ? "" : normalized.slice(0, slash);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

function titleCase(value: string): string {
  return value
    .replaceAll(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function mediaCollection(kind: MediaKind): string | undefined {
  switch (kind) {
    case "blog-post":
      return "_ai-blog";
    case "social-posts":
      return "_ai-social-posts";
    case "cheatsheet":
      return "_ai-cheat-sheets";
    case "infographic":
      return "_ai-infographics";
    case "slides":
      return "_ai-slides";
    case "notebook":
      return "_ai-notebooks";
    case "podcast":
      return "_ai-podcasts";
    case "short-video":
      return "_ai-videos";
    case "meme":
      return "_ai-memes";
    default:
      return undefined;
  }
}

function mediaPath(
  globals: z.infer<typeof GlobalArgsSchema>,
  kind: MediaKind,
  title: string,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(title);
  const collection = mediaCollection(kind);
  if (collection) {
    return pathJoin(globals.repoDir, collection, `${today}-${slug}.md`);
  }
  return pathJoin(
    globals.repoDir,
    "_data/generated/media",
    `${today}-${kind}-${slug}.yml`,
  );
}

function renderMediaMarkdown(
  kind: MediaKind,
  title: string,
  args: MediaGenerationArgs,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const label = titleCase(kind);
  const body = mediaBody(kind, title, args);
  return `---
title: "${title.replaceAll('"', '\\"')}"
date: ${today}
layout: post
collection: ai-${kind}
media_kind: ${kind}
source: "${args.source.replaceAll('"', '\\"')}"
---

# ${title}

${body}

---

Generated as ${label} content from: ${args.source}
`;
}

function mediaBody(
  kind: MediaKind,
  title: string,
  args: MediaGenerationArgs,
): string {
  switch (kind) {
    case "blog-post":
      return `Intent first. Code second.

This draft turns ${args.topic} into an AI engineering note: what changed, what breaks, and what an engineer should verify before trusting the output.

## Angle

- The practical claim: ${args.topic}
- The failure mode worth testing
- The operational checklist before shipping

## Draft

The machine can generate a plausible path. The engineer still owns the map.

Use this post as a starting point for a tighter final essay.`;
    case "social-posts":
      return `## LinkedIn

${args.topic}: the useful question is not whether AI can produce output. It is whether you can tell when the output is wrong.

## Bluesky

AI can draft the thing. You still need to inspect the joints.

## X

AI generation is cheap. Verification is the job.`;
    case "cheatsheet":
      return `## Core Checks

- Define the expected behavior before generating.
- Inspect integration boundaries.
- Test failure paths, not only the happy path.
- Keep generated changes small enough to review.

## Commands

\`\`\`bash
swamp workflow validate media-production --json
swamp workflow run media-production
\`\`\``;
    case "infographic":
      return `## Infographic Brief

Title: ${title}

Panels:

1. Input: topic, sources, constraints.
2. Generation: model turns intent into draft assets.
3. Verification: engineer checks facts, code, and fit.
4. Shipping: markdown and data land in the static site.

Visual direction: dense dashboard, high contrast, minimal ornament.`;
    case "short-video":
      return `## Script

Hook: AI did not remove the engineering job. It moved it.

Beat 1: Generation is now fast enough to be disposable.

Beat 2: Review, tests, and taste are the remaining bottlenecks.

Beat 3: Ship only what you can explain.

CTA: Run the workflow, inspect the artifact, improve the prompt.`;
    case "podcast":
      return `## NotebookLM Podcast Packet

Use this notebook as the source pack for NotebookLM audio overview generation.

### Source Brief

Topic: ${args.topic}

Context: ${args.source}

### Host Notes

- Open with the practical problem.
- Contrast generated speed with verification cost.
- End with a concrete workflow listeners can run.

### Suggested Audio Overview Prompt

Create a two-host technical podcast episode from this notebook. Keep it practical, skeptical, and focused on AI engineering workflows.`;
    case "slides":
      return `## Slide Outline

1. ${title}
2. Why this workflow exists
3. Input sources
4. Generation steps
5. Review gates
6. Static-site publishing
7. Failure modes
8. Next iteration`;
    case "notebook":
      return `## Notebook

### Question

What does ${args.topic} change for an AI engineer?

### Notes

- Source material: ${args.source}
- Claims to verify
- Examples to collect
- Follow-up workflows to run

### Working Conclusion

Generated material is useful when it becomes inspectable, versioned content.`;
    case "meme":
      return `caption: "When the model says it shipped, but the tests say it hallucinated the API."
format: image-brief
scene: Split screen. Left: confident generated output. Right: a calm terminal showing failing validation.
alt: Meme brief about validating AI-generated work before publishing.`;
  }
}

async function generateMediaArtifact(
  kind: MediaKind,
  args: MediaGenerationArgs,
  context: {
    globalArgs: unknown;
    writeResource: (
      spec: string,
      name: string,
      value: unknown,
    ) => Promise<unknown>;
  },
) {
  const globals = GlobalArgsSchema.parse(context.globalArgs);
  const today = new Date().toISOString().slice(0, 10);
  const title = args.title || `${titleCase(kind)}: ${args.topic}`;
  const path = mediaPath(globals, kind, title);
  const markdown = renderMediaMarkdown(kind, title, args);
  const relativePath = path.startsWith(`${globals.repoDir}/`)
    ? path.slice(globals.repoDir.length + 1)
    : path;
  const artifact = {
    generated_at: new Date().toISOString(),
    date: today,
    kind,
    title,
    topic: args.topic,
    source: args.source,
    path: relativePath,
    content: markdown,
    dryRun: args.dryRun,
  };

  if (args.writeFile && !args.dryRun) {
    const dir = directoryName(path);
    if (dir) await Deno.mkdir(dir, { recursive: true });
    await Deno.writeTextFile(
      path,
      mediaCollection(kind) ? markdown : stringifyYaml(artifact),
    );
  }

  const handle = await context.writeResource(
    "media-artifact",
    `${today}-${kind}-${slugify(title)}`,
    artifact,
  );
  return { dataHandles: [handle] };
}

function renderRssXml(
  digest: z.infer<typeof DigestSchema>,
  siteUrl: string,
): string {
  const channelUrl = absoluteUrl("/news/", siteUrl);
  const feedUrl = absoluteUrl("/rss.xml", siteUrl);
  const items = rankedItems([...digest.items]).map((item) => {
    const itemUrl = absoluteUrl(item.url, siteUrl);
    const title = escapeXml(item.title);
    const description = escapeXml(item.summary);
    const category = escapeXml(item.category);
    const source = escapeXml(item.source);
    const pubDate = rfc822Date(item.published_at);

    return `    <item>
      <title>${title}</title>
      <link>${escapeXml(itemUrl)}</link>
      <guid isPermaLink="true">${escapeXml(itemUrl)}</guid>
      <description>${description}</description>
      <category>${category}</category>
      <source url="${escapeXml(itemUrl)}">${source}</source>
      <pubDate>${pubDate}</pubDate>
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Alvagante News of the Day</title>
    <link>${escapeXml(channelUrl)}</link>
    <atom:link href="${
    escapeXml(feedUrl)
  }" rel="self" type="application/rss+xml" />
    <description>Daily AI-assisted news digest from Alvagante.</description>
    <language>en</language>
    <lastBuildDate>${rfc822Date(digest.generated_at)}</lastBuildDate>
    <pubDate>${rfc822Date(digest.generated_at)}</pubDate>
${items}
  </channel>
</rss>
`;
}

// ─── Link metadata enrichment helpers ────────────────────────────────────────

/** Extract a <meta> tag content value from raw HTML. */
function extractMeta(
  html: string,
  key: string,
  attr: "property" | "name",
): string | undefined {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+${attr}=["']${esc}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${esc}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m?.[1]) return decodeEntities(m[1]).trim();
  }
  return undefined;
}

/** Fetch og:image and description-class meta from a URL's HTML. */
async function fetchSiteMetadata(url: string): Promise<SiteMetadata> {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "alvagante-site-curation/1.0",
        "accept": "text/html,*/*",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return {};
    const html = await response.text();
    const ogImage = extractMeta(html, "og:image", "property") ??
      extractMeta(html, "twitter:image", "name");
    const ogDesc = extractMeta(html, "og:description", "property") ??
      extractMeta(html, "description", "name");
    return {
      ogImage: ogImage || undefined,
      description: ogDesc || undefined,
    };
  } catch {
    return {};
  }
}

/** Concurrent map — errors per-item are captured, not thrown. */
async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<Array<{ value?: R; error?: unknown }>> {
  const results: Array<{ value?: R; error?: unknown }> = new Array(
    items.length,
  );
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const idx = i;
    const p: Promise<void> = fn(items[idx], idx)
      .then((value) => {
        results[idx] = { value };
      })
      .catch((error) => {
        results[idx] = { error };
      })
      .finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= concurrency) await Promise.race(executing);
  }
  await Promise.all(executing);
  return results;
}

const LINK_ENRICH_SYSTEM_PROMPT =
  `You are enriching a curated link directory for a technical personal site covering AI, IT, Security, Science, Geopolitics, and Technology.

For each link item provided, return enrichments based on your training knowledge:

- description: 1-2 factual sentences (80-200 chars total). State what the resource IS and why it is useful. Never start with "This is" or "A ". Use og_hint as extra context when present.
- pricing: "free" (no cost ever), "freemium" (free tier + paid plans), "paid" (subscription or pay-per-use, no free tier), or "unknown" if genuinely unsure.
- audience: exactly one of "developers", "builders" (ML/AI/startup practitioners), "researchers", "general", "security-professionals".
- sublinks: 1-3 high-value canonical child pages (official docs, GitHub repo, pricing page, playground, blog). ONLY include URLs you are certain exist for this specific resource. Return [] if you are not certain — hallucinated URLs are worse than none.

Return one output object per input item, always matched by url. Never omit an item.`;

async function callAIForLinksOpenAI(
  apiKey: string,
  model: string,
  items: LinkEnrichInput[],
): Promise<LinkEnrichOutput[]> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: LINK_ENRICH_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ links: items }) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "link_enrichments",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              links: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    url: { type: "string" },
                    description: { type: "string" },
                    pricing: {
                      type: "string",
                      enum: ["free", "freemium", "paid", "unknown"],
                    },
                    audience: { type: "string" },
                    sublinks: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          title: { type: "string" },
                          url: { type: "string" },
                        },
                        required: ["title", "url"],
                      },
                    },
                  },
                  required: [
                    "url",
                    "description",
                    "pricing",
                    "audience",
                    "sublinks",
                  ],
                },
              },
            },
            required: ["links"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI link enrichment failed: ${response.status} ${await response
        .text()}`,
    );
  }

  const payload = await response.json();
  const textOutput = payload.output_text ??
    payload.output
      ?.flatMap(
        (e: { content?: Array<{ text?: string }> }) => e.content ?? [],
      )
      .map((c: { text?: string }) => c.text ?? "")
      .join("");
  const parsed = JSON.parse(textOutput);
  return (parsed.links ?? []) as LinkEnrichOutput[];
}

async function callAIForLinksOllama(
  baseUrl: string,
  model: string,
  items: LinkEnrichInput[],
): Promise<LinkEnrichOutput[]> {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: LINK_ENRICH_SYSTEM_PROMPT +
            "\nReturn a JSON object with a 'links' array.",
        },
        { role: "user", content: JSON.stringify({ links: items }) },
      ],
      response_format: { type: "json_object" },
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama link enrichment failed: ${response.status} ${await response
        .text()}`,
    );
  }

  const payload = await response.json();
  const textOutput: string = payload.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(textOutput);
  return (parsed.links ?? []) as LinkEnrichOutput[];
}

/**
 * Read all per-topic YAML link files into a Map keyed by absolute file path.
 * Only reads exactly 2 levels deep: <linksPath>/<topic>/<file>.yml
 */
async function readLinkFiles(
  linksPath: string,
  topics?: string[],
): Promise<Map<string, Link[]>> {
  const fileMap = new Map<string, Link[]>();
  try {
    for await (const topicEntry of Deno.readDir(linksPath)) {
      if (!topicEntry.isDirectory) continue;
      if (topics && !topics.includes(topicEntry.name)) continue;
      const topicPath = pathJoin(linksPath, topicEntry.name);
      for await (const catEntry of Deno.readDir(topicPath)) {
        if (!catEntry.isFile || !/\.ya?ml$/.test(catEntry.name)) continue;
        const filePath = pathJoin(topicPath, catEntry.name);
        const raw = await readYamlFile<unknown[]>(filePath, []);
        fileMap.set(filePath, z.array(LinkSchema).parse(raw));
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return fileMap;
}

// ─── Model definition ─────────────────────────────────────────────────────────

/** Model definition for site curation. */
export const model = {
  type: "@alvagante/site-curation",
  version: "2026.05.27.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    "feed-items": {
      description: "Fetched feed items normalized for digest generation",
      schema: z.object({
        generated_at: z.string(),
        items: z.array(NewsItemSchema),
      }),
      lifetime: "7d",
      garbageCollection: 14,
    },
    "links": {
      description:
        "Curated links enriched with default favicon and check metadata",
      schema: z.object({
        generated_at: z.string(),
        links: z.array(LinkSchema),
      }),
      lifetime: "30d",
      garbageCollection: 10,
    },
    "digest": {
      description:
        "Daily news digest data matching _data/generated/news/YYYY-MM-DD.yml",
      schema: DigestSchema,
      lifetime: "30d",
      garbageCollection: 30,
    },
    "link-enrichment": {
      description: "Stats and report from a link metadata enrichment run",
      schema: z.object({
        generated_at: z.string(),
        stats: z.object({
          total: z.number(),
          needsEnrichment: z.number(),
          enriched: z.number(),
          descriptionsUpdated: z.number(),
          pricingUpdated: z.number(),
          audienceUpdated: z.number(),
          logosFound: z.number(),
          sublinksAdded: z.number(),
          filesWritten: z.number(),
          errors: z.number(),
          dryRun: z.boolean(),
        }),
      }),
      lifetime: "7d",
      garbageCollection: 5,
    },
    "media-artifact": {
      description:
        "Generated AI-engineering media content written to site files",
      schema: z.object({
        generated_at: z.string(),
        date: z.string(),
        kind: MediaKindSchema,
        title: z.string(),
        topic: z.string(),
        source: z.string(),
        path: z.string(),
        content: z.string(),
        dryRun: z.boolean(),
      }),
      lifetime: "30d",
      garbageCollection: 20,
    },
  },
  methods: {
    write_blog_post: {
      description:
        "Generate a blog post markdown artifact for the AI Engineer section",
      arguments: MediaGenerationArgsSchema,
      execute: async (args, context) =>
        await generateMediaArtifact("blog-post", args, context),
    },
    generate_social_posts: {
      description:
        "Generate social post copy and ship it as static site content",
      arguments: MediaGenerationArgsSchema,
      execute: async (args, context) =>
        await generateMediaArtifact("social-posts", args, context),
    },
    generate_cheatsheet: {
      description:
        "Generate a technical cheat sheet and ship it as static site content",
      arguments: MediaGenerationArgsSchema,
      execute: async (args, context) =>
        await generateMediaArtifact("cheatsheet", args, context),
    },
    generate_infographic: {
      description:
        "Generate an infographic brief and ship it as static site content",
      arguments: MediaGenerationArgsSchema,
      execute: async (args, context) =>
        await generateMediaArtifact("infographic", args, context),
    },
    generate_short_video: {
      description:
        "Generate a short-form video script and publishable content record",
      arguments: MediaGenerationArgsSchema,
      execute: async (args, context) =>
        await generateMediaArtifact("short-video", args, context),
    },
    prepare_notebooklm_podcast: {
      description:
        "Prepare a NotebookLM source notebook for podcast audio generation",
      arguments: MediaGenerationArgsSchema,
      execute: async (args, context) =>
        await generateMediaArtifact("podcast", args, context),
    },
    generate_slides: {
      description:
        "Generate a slide outline and ship it as static site content",
      arguments: MediaGenerationArgsSchema,
      execute: async (args, context) =>
        await generateMediaArtifact("slides", args, context),
    },
    generate_notebook: {
      description:
        "Generate a working notebook note and ship it as static site content",
      arguments: MediaGenerationArgsSchema,
      execute: async (args, context) =>
        await generateMediaArtifact("notebook", args, context),
    },
    create_meme: {
      description:
        "Generate a meme brief and publishable generated media record",
      arguments: MediaGenerationArgsSchema,
      execute: async (args, context) =>
        await generateMediaArtifact("meme", args, context),
    },
    fetch_feeds: {
      description:
        "Fetch all enabled feeds from _data/sources in one fan-out run",
      arguments: FetchFeedsArgsSchema,
      execute: async (args, context) => {
        const globals = GlobalArgsSchema.parse(context.globalArgs);
        const repoDir = globals.repoDir;
        const items = await fetchItems(
          repoDir,
          globals,
          args.maxItemsPerSource,
          args.feedFetchTimeoutMs,
        );
        const handle = await context.writeResource("feed-items", "fetched", {
          generated_at: new Date().toISOString(),
          items,
        });
        return { dataHandles: [handle] };
      },
    },
    enrich_links: {
      description:
        "Normalize curated link metadata and write enriched link output",
      arguments: z.object({}),
      execute: async (_args, context) => {
        const globals = GlobalArgsSchema.parse(context.globalArgs);
        const linksPath = pathJoin(globals.repoDir, globals.linksPath);
        const rawLinks = await readYamlListPath(linksPath);
        const links = z.array(LinkSchema).parse(rawLinks).map((link) => ({
          ...link,
          favicon: link.favicon ||
            `https://www.google.com/s2/favicons?sz=64&domain=${
              new URL(link.url).hostname
            }`,
          last_checked: new Date().toISOString().slice(0, 10),
        }));
        const handle = await context.writeResource("links", "curated", {
          generated_at: new Date().toISOString(),
          links,
        });
        return { dataHandles: [handle] };
      },
    },
    enrich_news_items: {
      description: "Fetch and optionally AI-enrich feed items in one run",
      arguments: z.object({
        openaiApiKey: z.string().optional(),
        openaiModel: z.string().optional(),
        ollamaBaseUrl: z.string().optional(),
        ollamaModel: z.string().optional(),
      }),
      execute: async (args, context) => {
        const globals = GlobalArgsSchema.parse(context.globalArgs);
        const items = await fetchItems(globals.repoDir, globals);
        const apiKey = args.openaiApiKey || globals.openaiApiKey ||
          Deno.env.get("OPENAI_API_KEY");
        const ollamaModel = args.ollamaModel || globals.ollamaModel;
        const enriched = apiKey
          ? await callOpenAI(
            apiKey,
            args.openaiModel || globals.openaiModel,
            items,
            globals.aiRequestTimeoutMs,
          )
          : ollamaModel
          ? await callOllama(
            args.ollamaBaseUrl || globals.ollamaBaseUrl,
            ollamaModel,
            items,
            globals.aiRequestTimeoutMs,
          )
          : items;
        const withSourceMetadata = filterPromotionalItems(
          preserveSourceMetadata(enriched, items),
        );
        const handle = await context.writeResource("feed-items", "enriched", {
          generated_at: new Date().toISOString(),
          items: withSourceMetadata,
        });
        return { dataHandles: [handle] };
      },
    },
    build_daily_digest: {
      description:
        "Fetch, enrich, rank, and write the daily Jekyll digest YAML",
      arguments: BuildDigestArgsSchema,
      execute: async (args, context) => {
        const globals = GlobalArgsSchema.parse(context.globalArgs);
        const date = args.date || new Date().toISOString().slice(0, 10);
        const outDir = pathJoin(globals.repoDir, globals.generatedNewsDir);

        // Collect URLs from the 2 most recent digests from *previous* dates to avoid
        // republishing across days. Digests with the same date as the current run are
        // excluded so that re-runs don't consume that day's article pool.
        const seenUrls = new Set<string>();
        try {
          const existing: string[] = [];
          for await (const entry of Deno.readDir(outDir)) {
            if (
              entry.isFile &&
              /^\d{4}-\d{2}-\d{2}\.ya?ml$/.test(entry.name) &&
              entry.name !== `${date}.yml`
            ) {
              existing.push(entry.name);
            }
          }
          existing.sort().reverse();
          for (const fname of existing.slice(0, 2)) {
            const prev = await readYamlFile<{ items?: Array<{ url: string }> }>(
              pathJoin(outDir, fname),
              {},
            );
            for (const item of (prev.items ?? [])) {
              if (item.url) seenUrls.add(item.url);
            }
          }
        } catch {
          // directory may not exist yet
        }

        const selectionMode = args.feedSelectionMode ??
          globals.feedSelectionMode;
        const fetchLimit = args.maxItemsPerSource ??
          (selectionMode === "latest_per_source"
            ? args.latestItemsPerSource ?? globals.latestItemsPerSource
            : globals.maxItemsPerSource);
        const items = filterPromotionalItems(
          await fetchItems(
            globals.repoDir,
            globals,
            fetchLimit,
            args.feedFetchTimeoutMs,
          ),
        );
        if (items.length === 0) {
          throw new Error(
            "No feed items fetched; refusing to build empty digest",
          );
        }
        const selectedItems = selectItemsForDigest(items, date, globals, args);

        // Drop URLs already present in the last 2 digests
        const freshItems = selectedItems.filter((item) =>
          !seenUrls.has(itemKey(item))
        );
        if (freshItems.length === 0) {
          throw new Error(
            "No fresh feed items remain after de-duplication; refusing to build empty digest",
          );
        }

        const apiKey = args.openaiApiKey || globals.openaiApiKey ||
          Deno.env.get("OPENAI_API_KEY");
        const ollamaModel = args.ollamaModel || globals.ollamaModel;
        const aiRequestTimeoutMs = args.aiRequestTimeoutMs ??
          globals.aiRequestTimeoutMs;
        const enriched = apiKey
          ? await callOpenAI(
            apiKey,
            args.openaiModel || globals.openaiModel,
            freshItems,
            aiRequestTimeoutMs,
          )
          : ollamaModel
          ? await callOllama(
            args.ollamaBaseUrl || globals.ollamaBaseUrl,
            ollamaModel,
            freshItems,
            aiRequestTimeoutMs,
          )
          : freshItems;
        const withSourceMetadata = filterPromotionalItems(
          preserveSourceMetadata(enriched, freshItems),
        );
        const digest = DigestSchema.parse({
          date,
          generated_at: new Date().toISOString(),
          items: sortItems(
            withSourceMetadata,
            args.maxItems ?? globals.maxDigestItems,
          ),
        });

        if (args.writeFile) {
          await Deno.mkdir(outDir, { recursive: true });
          await Deno.writeTextFile(
            pathJoin(outDir, `${date}.yml`),
            stringifyYaml(digest),
          );

          if (args.writeRss) {
            const rssPath = pathJoin(globals.repoDir, globals.rssPath);
            const rssDir = directoryName(rssPath);
            if (rssDir) await Deno.mkdir(rssDir, { recursive: true });
            await Deno.writeTextFile(
              rssPath,
              renderRssXml(digest, globals.siteUrl),
            );
          }
        }

        const handle = await context.writeResource("digest", date, digest);
        return { dataHandles: [handle] };
      },
    },
    enrich_link_metadata: {
      description: "Enrich curated link YAML files in three phases: " +
        "(1) AI-inferred descriptions, pricing, and audience; " +
        "(2) upstream HTML fetch for og:image logo and meta description hint; " +
        "(3) AI-suggested canonical sublinks. " +
        "Writes enriched data back to source _data/links files.",
      arguments: EnrichLinkMetadataArgsSchema,
      execute: async (args, context) => {
        const globals = GlobalArgsSchema.parse(context.globalArgs);
        const linksPath = pathJoin(globals.repoDir, globals.linksPath);
        const apiKey = args.openaiApiKey || globals.openaiApiKey ||
          Deno.env.get("OPENAI_API_KEY");
        const ollamaModel = args.ollamaModel || globals.ollamaModel;
        const today = new Date().toISOString().slice(0, 10);

        // Stats counters
        let total = 0;
        let needsEnrichmentCount = 0;
        let enriched = 0;
        let descriptionsUpdated = 0;
        let pricingUpdated = 0;
        let audienceUpdated = 0;
        let logosFound = 0;
        let sublinksAdded = 0;
        let errors = 0;

        // Read all link files into memory, keyed by file path
        const fileMap = await readLinkFiles(linksPath, args.topics);

        // Build a flat index: [{filePath, index, link}]
        type Entry = { filePath: string; index: number; link: Link };
        const allEntries: Entry[] = [];
        for (const [filePath, links] of fileMap) {
          for (let i = 0; i < links.length; i++) {
            allEntries.push({ filePath, index: i, link: links[i] });
            total++;
          }
        }

        // Determine which entries need work
        const needsWork = (link: Link): boolean => {
          if (args.forceReenrich) return true;
          const terseDescript =
            link.description.length < args.descriptionMinLength;
          return (
            (args.phase1 &&
              (terseDescript || link.pricing === "unknown")) ||
            (args.phase2 && !link.logo) ||
            (args.phase3 && link.sublinks.length === 0)
          );
        };

        const targets = allEntries.filter(({ link }) => needsWork(link));
        needsEnrichmentCount = targets.length;

        // ── Phase 2: upstream metadata fetch ─────────────────────────────────
        // Fetch og:image and meta description for each link missing a logo.
        // The meta description is passed as ogHint to Phase 1 for richer AI context.
        const metaMap = new Map<string, SiteMetadata>();

        if (args.phase2) {
          const phase2Targets = targets.filter(({ link }) => !link.logo);
          const metaResults = await pMap(
            phase2Targets,
            async ({ link }) => {
              const meta = await fetchSiteMetadata(link.url);
              return { url: link.url, meta };
            },
            args.concurrency,
          );

          for (const result of metaResults) {
            if (result.error) {
              errors++;
              continue;
            }
            const { url, meta } = result.value!;
            metaMap.set(url, meta);
            if (meta.ogImage) {
              // Find the entry and update its logo in the fileMap in-place
              const entry = targets.find((e) => e.link.url === url);
              if (entry) {
                fileMap.get(entry.filePath)![entry.index].logo = meta.ogImage;
                logosFound++;
              }
            }
          }
        }

        // ── Phase 1 + 3: AI enrichment ────────────────────────────────────────
        // Batch entries that need description, pricing, audience, or sublinks.
        if (args.phase1 || args.phase3) {
          const aiTargets = targets.filter(({ link }) => {
            const terseDescript =
              link.description.length < args.descriptionMinLength;
            return (
              (args.phase1 && (terseDescript || link.pricing === "unknown")) ||
              (args.phase3 && link.sublinks.length === 0)
            );
          });

          if (aiTargets.length > 0 && (apiKey || ollamaModel)) {
            // Split into batches
            const batches: Entry[][] = [];
            for (let i = 0; i < aiTargets.length; i += args.batchSize) {
              batches.push(aiTargets.slice(i, i + args.batchSize));
            }

            for (const batch of batches) {
              const inputs: LinkEnrichInput[] = batch.map(({ link }) => {
                const terseDescript =
                  link.description.length < args.descriptionMinLength;
                const meta = metaMap.get(link.url);
                return {
                  url: link.url,
                  title: link.title,
                  description: link.description,
                  category: link.category,
                  section: link.section,
                  pricing: link.pricing,
                  audience: link.audience,
                  hasSublinks: link.sublinks.length > 0,
                  // Pass upstream site snippet as AI context when available
                  ogHint: meta?.description,
                  needsDescription: args.phase1 && terseDescript,
                  needsPricing: args.phase1 && link.pricing === "unknown",
                  needsSublinks: args.phase3 && link.sublinks.length === 0,
                };
              });

              try {
                const outputs: LinkEnrichOutput[] = apiKey
                  ? await callAIForLinksOpenAI(
                    apiKey,
                    args.openaiModel || globals.openaiModel,
                    inputs,
                  )
                  : await callAIForLinksOllama(
                    args.ollamaBaseUrl || globals.ollamaBaseUrl,
                    ollamaModel!,
                    inputs,
                  );

                const byUrl = new Map(outputs.map((o) => [o.url, o]));

                for (const { filePath, index, link } of batch) {
                  const out = byUrl.get(link.url);
                  if (!out) continue;

                  const fileLinks = fileMap.get(filePath)!;
                  let changed = false;
                  const terseDescript =
                    link.description.length < args.descriptionMinLength;

                  // Only update description if AI produced a longer, non-empty one
                  if (
                    args.phase1 &&
                    terseDescript &&
                    out.description &&
                    out.description.length > link.description.length
                  ) {
                    fileLinks[index].description = out.description;
                    descriptionsUpdated++;
                    changed = true;
                  }

                  // Only override pricing when we have a definitive answer
                  if (
                    args.phase1 &&
                    out.pricing &&
                    out.pricing !== "unknown" &&
                    link.pricing === "unknown"
                  ) {
                    fileLinks[index].pricing = out.pricing;
                    pricingUpdated++;
                    changed = true;
                  }

                  // Update audience when AI returns a different value
                  if (
                    args.phase1 &&
                    out.audience &&
                    out.audience !== link.audience
                  ) {
                    fileLinks[index].audience = out.audience;
                    audienceUpdated++;
                    changed = true;
                  }

                  // Add sublinks only if the entry had none
                  if (
                    args.phase3 &&
                    out.sublinks &&
                    out.sublinks.length > 0 &&
                    link.sublinks.length === 0
                  ) {
                    fileLinks[index].sublinks = out.sublinks;
                    sublinksAdded++;
                    changed = true;
                  }

                  if (changed) enriched++;
                }
              } catch (_err) {
                errors++;
                // Continue with next batch rather than aborting the whole run
              }
            }
          }
        }

        // Update last_checked on all links in touched files
        for (const links of fileMap.values()) {
          for (const link of links) {
            link.last_checked = today;
          }
        }

        // Write back to source files (unless dry run)
        let filesWritten = 0;
        if (!args.dryRun) {
          for (const [filePath, links] of fileMap) {
            await Deno.writeTextFile(filePath, stringifyYaml(links));
            filesWritten++;
          }
        }

        const stats = {
          total,
          needsEnrichment: needsEnrichmentCount,
          enriched,
          descriptionsUpdated,
          pricingUpdated,
          audienceUpdated,
          logosFound,
          sublinksAdded,
          filesWritten,
          errors,
          dryRun: args.dryRun,
        };

        const handle = await context.writeResource(
          "link-enrichment",
          today,
          { generated_at: new Date().toISOString(), stats },
        );
        return { dataHandles: [handle] };
      },
    },
  },
};
