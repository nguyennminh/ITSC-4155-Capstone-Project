# Matching

Request-time ranking uses quantized (`q8`) Xenova/all-MiniLM-L6-v2 with mean
pooling and normalized vectors on the server. The first request downloads model
artifacts; subsequent requests reuse them. Jobs with evidenced skill overlap qualify. Greenhouse listings can also qualify on a preferred title match, with zero skill coverage if no overlap is detected. Scores combine 60% listed skill coverage and 40% cosine
similarity (clamped to 0–1). These are fit estimates, not hiring probabilities.

Embeddings use a bounded, process-local cache (2,000 entries), keyed by model
artifact revision, quantization and SHA-256 of the exact input text. Concurrent
requests reuse pending embeddings; failed embeddings are removed. Restarting
the server clears this cache. No profile text is sent to a model API for ranking.

If model loading or inference fails, matching automatically uses deterministic
keyword coverage: 90 points for skill coverage, 5 for preferred title and 5 for
location. The API and Discover show the fallback. Unknown work arrangements
remain eligible with a warning; known incompatible arrangements are excluded.
Employment type preferences still filter jobs.

Gemini is optional via `/api/jobs/explain`, requires separate explicit consent,
and receives one selected listing plus allowlisted qualification fields and
preferences. It does not change ranking. Name/email fields and raw resumes are
excluded, but personal information in qualification text may be transmitted.

The default Greenhouse provider reads configured public employer boards and
caches them for ten minutes. It prioritizes detected skills and preferred title
while taking turns across employers to select up to 40 listings for matching.
Unknown employment types remain eligible with a warning. Only standard hosted
Greenhouse forms are included for extension compatibility.

With the optional Adzuna source, set `ADZUNA_PAGES=1`, `2` or `3` on the server (default 1; values are clamped to
1–3). Each page requests 20 results. Fetching stops on a short page, deduplicates
across all pages, and caches the combined listings for ten minutes. Descriptions
are provider excerpts; consult the original posting for full requirements.

Run `node --test test/local-matcher.test.js test/provider.test.js` for deterministic
runtime/cache/fallback/pagination checks using an injected encoder. A real-model
smoke test also requires network access for the initial model download.
