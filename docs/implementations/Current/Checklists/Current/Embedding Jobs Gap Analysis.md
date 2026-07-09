@file:plan.prompt.md explains the process for making workplans in the repo. @file:Embedding Jobs.md and @file:Embedding Jobs 2.md  are the  current workplans that purport to describe the implementation of the session memory `plan.md` file that details the scope and order for the solution to the fix for the model call compression service in this repo. 

We need to evaluate the `plan.md` file for its fitness to completely resolve the described problem with the compression service. And we need to check that the `Embedding Jobs` workplans properly describe that fix consistently, completely, and without material errors, omissions, or discrepencies. 

We also need to develop a description for an end-to-end verification described in WS-V that we can append to the last node in the second workplan immediately before the final commit. 

Run the plan.prompt.md command against these files to report back with errors, omissions, and discrepencies that we need to resolve before we begin implementation. 

## Procedure (as executed)

Per plan.prompt.md I re-read the workplan rules, read plan.md in full, read the WS node structures in both workplans (WP1 = Embedding Jobs.md: WS‑0/A/R/S; WP2 = Embedding Jobs 2.md: WS‑B/C/D), and verified the plan's grounding claims against the actual source. I did **not** edit any workplan and am **not** emitting formatted checklist nodes — this is the report + a WS‑V description, then I halt.

## Verdict on plan.md fitness

**The architecture in plan.md is sound and buildable.** The linchpin assumptions are grounded: the resume machinery (`parent_job_id`, `waiting_for_children` status, and the `handle_job_completion` DB trigger) already exists, `ai_providers.is_default_embedding` exists, and every "defect" claim (dropped column, hardcoded 3072, junk attribution, missing `dimensions`, PLAN/EXECUTE/RENDER enum) is confirmed in code. The end‑to‑end flow (chunk → async EMBED jobs → `dialectic_memory` with real attribution → resume → query‑embed jobs → resume → `match_dialectic_chunks` → RagContextSummary → overlay swap) is coherent and does eliminate synchronous in‑Supabase embedding.

**However, the workplans do not yet describe that fix without material errors.** There are three contract breaks that will not compile, one unresolved architectural contradiction, and two structural violations. These must be resolved before implementation.

---

## A. Contract breaks between nodes (will not compile) — highest priority

**A1. `createEmbedJobs` contract (WS‑S defines) ≠ how WS‑D consumes it.** This is the worst one:
- **Return shape:** WS‑S returns `{ createdCount }` ([Embedding Jobs.md](docs/implementations/Current/Checklists/Current/Embedding%20Jobs.md)); WP2 `compressPrompt` reads `{ jobsCreated }`.
- **Params:** WS‑S = `{ dbClient, parentJob, sourceDocuments: CreateEmbedJobsSourceDocument[], embeddingModelProviderId, walletId }`. WP2 passes `{ …, candidates, sessionId, projectId, iteration }` (Phase A) and `{ sourceType:'rag_query', sourceId, queryTexts, sessionId }` (Phase B) — different fields, and never supplies `walletId`.
- **Signature/arity:** WS‑S defines a two‑arg `CreateEmbedJobsFn(deps, params)` with **no** `CreateEmbedJobsPayload` and **no** bound form. WP2 `compressPrompt` requires `BoundCreateEmbedJobsFn(params, payload)`; WP2 `index.ts` binds it as `(params) => createEmbedJobs({logger,textSplitter}, params)` (one arg). The bound arity is inconsistent even within WP2.

**A2. `fileManager.uploadResource(...)` does not exist.** WP2 `compressPrompt` (line 868 node) calls `deps.fileManager.uploadResource(context, content)`. The real API is `uploadAndRegisterFile(context: UploadContext)` in file_manager.ts — single `UploadContext` arg, no `uploadResource`. The WP2 `index.ts` integration test correctly spies on `uploadAndRegisterFile`, so the `compressPrompt` node contradicts both the real service and its own workplan.

**A3. `match_dialectic_chunks` call ≠ the RPC WS‑0 creates.** Existing/WS‑0 args are `query_embedding, query_text, match_threshold, match_count, session_id_filter, rrf_k` (verified in types_db.ts). WP2 Phase C calls `{ query_embedding, p_session_id, min_similarity, match_count, p_source_type, p_source_id }` — renamed args, **drops `query_text`** (breaks the FTS half of the RRF pipeline), and adds `p_source_type`/`p_source_id` as **filter** args. But WS‑0 only adds `source_type`/`source_id` to the RETURNS projection, not as filter parameters. The RPC being called is not the RPC being defined.

## B. Unresolved architectural contradiction

**B1. Fate of `embeddingClient` / compression‑candidate scoring.** plan.md (WS‑D) says *"`embeddingClient` dep STAYS (used by compression‑strategy candidate scoring, which is internal and not an async job)."* WP2 `compressPrompt` **removes** `embeddingClient` and states `compressionStrategy` takes only `{ dbClient, logger }` *"per WS‑0 updated `ICompressionStrategy`."* But:
- WS‑0 has **no** compression‑strategy node, and
- the WS‑0 `vector_utils.ts` node threads `embeddingModelApiIdentifier` through `scoreResourceDocuments`/`getSortedCompressionCandidates` to satisfy the two‑arg `getEmbedding` — i.e., candidate scoring **still embeds synchronously**.

So either candidate scoring keeps synchronous embedding (violating the plan's core "no sync embedding" principle, contradicting WP2), or scoring must be re‑designed to avoid it (which requires a WS‑0 node that neither workplan contains). **This is the one design decision that must be made before coding**, because it determines the `compressPrompt` deps, the `compressionStrategy` signature, and whether a new WS‑0 node is needed.

---

## WS‑V — end‑to‑end verification (description to append to WP2's final `index.ts` node, before the last commit)

A single `dialectic-worker` integration test that drives the **whole compression seam** with only true external boundaries (Netlify HTTP, Supabase) mocked and every internal function real. It is the test class that would have caught the original Netlify vector↔text disconnect.

**Scenario:** an oversized model input for one stage/session, using the real `createDialecticWorkerDeps` wiring.

**Assertions, in order:**
1. **Trigger:** `prepareModelJob` → `calculateAffordability` → `compressPrompt` detects input > window and does **not** enqueue a stream call; parent job is set to `waiting_for_children`; the return propagates as the pending variant up to `processSimpleJob`, which returns cleanly with **no** `execute_completed` notification and no failure/retry.
2. **Phase A fan‑out:** N `dialectic_generation_jobs` rows exist with `job_type='EMBED'`, `parent_job_id=parent.id`, and payloads carrying `chunk_text` + `source_type` + `source_id` + `embedding_model_provider_id`.
3. **Netlify seam:** each EMBED job's `enqueueModelCall` posts `operation:'embedding'` with `embedding_api_request.input === chunk_text`; the mocked callback returns a `number[]` vector.
4. **Persistence with real attribution:** `netlifyResponseHandler` → `saveResponse` embedding branch writes to `dialectic_memory` via `indexingService.insertChunk` with `content === chunk_text` (the text↔vector intersection), real `user_id`/`wallet_id`, correct `source_type`/`source_id`; a real wallet DEBIT is recorded. **Assert the stored vector is retrievable by its `source_id` and its `content` equals the original chunk text** (the seam that was previously untested).
5. **Resume → Phase B:** trigger wakes the parent; `compressPrompt` re‑runs, finds doc chunks present but query embeddings absent, spawns `rag_query` EMBED jobs, and pauses again.
6. **Resume → Phase C:** all embeddings present; `match_dialectic_chunks` is called with the pre‑computed query vector; a `RagContextSummary` resource is persisted via `uploadAndRegisterFile`, locatable by its canonical `(session, stage, document)` path.
7. **Overlay + final call:** `gatherArtifacts` → `applyCompressionOverlay` swaps the oversized document's `content` for the compressed context while preserving `id`/`document_key`/`stage_slug`/`type`; the recount now fits the window; a **stream** model call is finally enqueued.

**Commit** becomes the WS‑D + WS‑V commit (replacing the current final `index.ts` commit).

---

## Recommended resolution order before implementation
1. **Decide B1** (embeddingClient / candidate scoring) — it gates the `compressPrompt` and `compressionStrategy` contracts and possibly a new WS‑0 node.
2. Reconcile **A1** (`createEmbedJobs` interface — one canonical `Deps`/`Params`/`Return`/bound signature used by WS‑S, `compressPrompt`, and `index.ts`).
3. Fix **A2** (`uploadAndRegisterFile`) and **A3** (single agreed `match_dialectic_chunks` signature spanning WS‑0 and WS‑D).

I have **not** modified any workplan or plan.md. **Halting** — tell me which item(s) to fix first and grant explicit permission to edit, and I'll begin the node‑by‑node updates in dependency order.

A1: As you identified, the return shape, params, and signature must be identical throughout the plan. The application has a defined function construction method, shorthand is Function(deps, params, payload): FunctionFn => FunctionReturn = SuccessReturn | ErrorReturn; the DI binding is BoundFn(params, payload): BoundFn. 

A2: Yes the node must use the actual correct API for the call. 

A3: Yes the call must match the RPC definition. 

B1: Compression candidate scoring is to pick the next victim, not compress it. The compression has been moved to an explicit async job, but we still need to pick the next victim based on the algorithm that chooses the next-least-valuable candidate. This is not a "design choice" when the entire purpose of this entire set of work is explicitly to MAKE COMPRESSION AN EXPLICIT ASYNC JOB. If the choice was to leave it inline, I would delete both of these workplans, wouldn't I? 

WS-V: Yes, we need the end to end verification. 

Good — clear decisions. Before I can specify the corrected contracts precisely (and per the rules I won't edit any node until you explicitly say "edit now"), I need to (a) answer your C1 question with the current file state since it changed, and (b) ground B1/A2/A3 in the actual code so the reconciled contracts are correct. Let me do that now.  

## B1 — this confirms a missing node (need your call)

You're right that selection ("pick the next victim") stays and only compression becomes async. But the grounding shows the selection algorithm **itself embeds synchronously today**:

- vector_utils.ts L86: `getEmbedding(currentUserPrompt)` and L92: `getEmbedding(doc.content)` — it embeds the query and every document inline to compute cosine similarity → `valueScore`/`effectiveScore`.
- compressPrompt.ts L82–87 passes `deps.embeddingClient` straight into the strategy.

So "make all embedding async" means the scorer must **stop calling `getEmbedding` and instead read the pre-computed vectors from `dialectic_memory`** (the ones the EMBED jobs already wrote in Phases A/B). That is the true resolution of the `embeddingClient` contradiction: `compressPrompt` correctly drops `embeddingClient` (workplan 2's direction), **but only if** `scoreResourceDocuments`/`getSortedCompressionCandidates` are refactored to consume stored embeddings.

**That refactor is not in either workplan.** The WS‑0 `vector_utils.ts` node currently only swaps the `CompressionCandidate.sourceType` union and threads an identifier — it leaves the synchronous `getEmbedding` in place. **Decision needed:** should I expand the WS‑0 `vector_utils.ts` node (and the compression‑strategy signature) to score from `dialectic_memory` vectors and remove `embeddingClient` entirely? This also reorders the phases slightly (docs+query must be embedded *before* scoring can run in Phase C).

## A1 — canonical `createEmbedJobs` contract (does not exist yet)

I'll author it to the repo convention `Fn(deps, params, payload): Return = SuccessReturn | ErrorReturn` with bound `BoundFn(params, payload)`, and make WS‑S (definition), WS‑D `compressPrompt` (consumer), and `index.ts` (binding) all use that **one** shape — fixing the `createdCount`↔`jobsCreated`, params-shape, and arity mismatches. Proposed:
- `CreateEmbedJobsDeps = { logger, textSplitter }`
- `CreateEmbedJobsParams = { dbClient, parentJob, embeddingModelProviderId, walletId, userId, sessionId, projectId, iteration }`
- `CreateEmbedJobsPayload = { sources: { content, sourceType, sourceId }[] }` (docs in Phase A; query texts in Phase B via `sourceType:'rag_query'`)
- `CreateEmbedJobsReturn = CreateEmbedJobsSuccessReturn { createdCount } | CreateEmbedJobsErrorReturn { error, retriable }`

## A2 — `fileManager` correct API

`compressPrompt` Phase C will call `deps.fileManager.uploadAndRegisterFile(context: UploadContext)` (not `uploadResource`), building a `ResourceUploadContext` with `pathContext.fileType = FileType.RagContextSummary` (`'rag_context_summary'`, confirmed in file_manager.types.ts) plus `fileContent/mimeType/sizeBytes/userId/description` and `resourceDescriptionForDb`.

## A3 — `match_dialectic_chunks` exact call + one sub-decision

Real signature (20250829200213_dialectic_memory_embedding_3072.sql): `(query_embedding, query_text, match_threshold, match_count, session_id_filter, rrf_k=60)`. It's a **hybrid RRF** search, so it **requires `query_text`** — Phase C must pass both the stored query vector *and* the original query text (the current node drops `query_text`, breaking the FTS half).

**Decision needed:** the existing RPC filters by `session_id` only, not by source document. Do you want compression retrieval scoped **to the victim document's own chunks** (needs `source_type`/`source_id` added as *filter* params to the RPC in WS‑0 — more than the RETURNS-only change plan.md describes), or **session-wide** relevance (existing signature, no source filter)? This determines whether WS‑0's migration node changes the RPC arguments.

## WS-V — end-to-end verification (final description to append before the last commit)

A single `dialectic-worker` integration test, real internals, only Netlify HTTP + Supabase mocked, asserting in order:
1. Oversized input → `prepareModelJob`/`calculateAffordability`/`compressPrompt` do **not** enqueue a stream call; parent set to `waiting_for_children`; pending return propagates to `processSimpleJob`, which returns cleanly with **no** `execute_completed` and no retry.
2. N `EMBED` rows exist with `parent_job_id = parent.id` and payloads carrying `chunk_text` + `source_type` + `source_id` + `embedding_model_provider_id`.
3. Each EMBED `enqueueModelCall` posts `operation:'embedding'` with `input === chunk_text`; mocked callback returns a `number[]`.
4. `netlifyResponseHandler` → `saveResponse` embedding branch writes `dialectic_memory` via `indexingService.insertChunk` with `content === chunk_text`, real `user_id`/`wallet_id`, correct `source_type`/`source_id`, and a real wallet DEBIT. **Assert the stored vector is retrievable by `source_id` and its `content` equals the original chunk text** (the seam that was never tested).
5. Trigger resumes parent → Phase B spawns `rag_query` EMBED jobs → pauses again.
6. Resume → Phase C: `match_dialectic_chunks` called with the stored query vector **and** query text; `RagContextSummary` persisted via `uploadAndRegisterFile`, locatable by its canonical `(session, stage, document)` path.
7. `gatherArtifacts` → `applyCompressionOverlay` swaps the victim's `content` (identity fields `id`/`document_key`/`stage_slug`/`type` unchanged); recount now fits; a **stream** model call is finally enqueued.

This lands in the final `index.ts` node; its commit becomes the WS‑D + WS‑V commit.

---

**Two decisions block a fully-correct edit pass:** (B1) expand WS‑0 `vector_utils`/strategy to score from `dialectic_memory` and drop `embeddingClient`? and (A3) per-document vs session-wide retrieval (does the WS‑0 RPC gain source filter params)?

Give me those two answers plus **explicit permission to edit**, and I'll begin the node-by-node rewrite in dependency order (WS‑0 first), one node per turn, per the workplan procedure.

Ok, so open issue about getSortedCompressionCandidates exposes a problem - the objective was to minimize embedding costs and calls entirely by identifying the best victim (essentially, the largest context consumption crossed by lowest relevance) so that we would incrementally compress documents on command minimize embedding costs to the next increment - not compress all of them, then use the compressed product to pick which compressed versions to use, which maximizes compression costs. 

So what I'm hearing is that the prior broken version of the compression path compressed everything, and repeatedly, instead of the design objective of picking the next candidate victim and only compressing the minimum victims until the documents were compressed sufficiently to fit in the input window. 

Yes — your diagnosis is exactly right, and the grounding confirms it on both sides:

**The current (broken) selector embeds everything to score.** vector_utils.ts `scoreResourceDocuments` calls `getEmbedding(currentUserPrompt)` once (L86) and `getEmbedding(doc.content)` for **every** document (L92), computes cosine similarity → `valueScore`, then `effectiveScore = relevanceWeight × (1 − baseSimilarity)`. So to rank victims it pays the embedding cost for the entire document set up front — the opposite of "minimize embedding."

**Worse: workplan 2's WS‑D `compressPrompt` bakes that antipattern in.** Its Phase A says *"for each candidate call `deps.createEmbedJobs`"* — i.e., it spawns EMBED jobs for **all** oversized candidates in one shot, then retrieves. That is precisely "compress everything, then decide," which maximizes embedding cost and defeats the incremental design.

## The corrected design you're describing

Pick the **single next victim = max(size × low‑relevance)**, embed **only that victim** (+ the query if not yet embedded), RAG‑compress just it, recount, and **stop as soon as it fits**. One victim per resume cycle:

1. Count tokens. Fits → enqueue stream, done.
2. Over budget → select **one** victim cheaply.
3. Victim's chunks (and query) not in `dialectic_memory` → spawn EMBED jobs for **that victim only** → pause (`waiting_for_children`).
4. Resume → `match_dialectic_chunks` for that victim → persist `RagContextSummary` → overlay swaps its content → recount.
5. Still over → pick the **next** victim → repeat. Fits → enqueue stream.

This restructures the three‑phase machine from "Phase A embeds all candidates" into a **loop that embeds one victim at a time**, and it changes `createEmbedJobs`' payload from "all candidates" to "the chosen victim's sources."

## The one thing this still forces a decision on

"Largest consumption" is **free** (token count). But **"lowest relevance"** is what currently requires embeddings — and if we compute relevance by embedding, we're back to embedding everything just to rank. So selection must get its relevance signal from something that is **not** "embed every document now." Grounded options:

- **(a) Size‑only selection.** Pick the biggest document. Zero embedding for selection; embeddings happen only on the victim you compress. Simplest and strictly embedding‑minimal, but ignores relevance (you might compress a large, highly‑relevant doc).
- **(b) Cheap relevance proxy, no embeddings.** Rank by `size × (1 − keyword/FTS overlap with the query)` using Postgres full‑text (which `dialectic_memory`/`match_dialectic_chunks` already use for the RRF text half) or metadata (stage distance, recency, document type). Approximates "least relevant, biggest" without any embedding call.
- **(c) Reuse already‑stored embeddings.** Score only documents whose embeddings are *already* in `dialectic_memory` (e.g., from prior stages); rank the rest by size. Free where data exists, size‑fallback otherwise.

My recommendation is **(b)** — it preserves your "largest × least‑relevant" intent while keeping selection fully embedding‑free, and it reuses the FTS machinery already in the RAG path. But this is your architectural call, and it directly determines the `compressPrompt` loop shape, the `createEmbedJobs` payload (single victim vs. set), and whether the WS‑0 `vector_utils` node deletes the `getEmbedding` calls from `scoreResourceDocuments` entirely.

Which selection basis do you want — (a), (b), or (c)? Once you pick, I'll have everything needed to reconcile the `createEmbedJobs`/`compressPrompt`/`vector_utils` contracts and the phase loop, and I'll wait for your explicit go‑ahead before editing any node.

To restate the problem clearly, I have a variety of documents I need to send to an agent. They range from large to small, and from high relevance to low. Their relevance is independent of their size. I have an embedding client that can transform them into vectors against chunks, and compute a cosine similarity to pick which document is the max cross product of largest size and lowest relevance. The goal is to only send compressed versions of the largest, lowest-relevance documents, and to incrementally choose the next victim based on which uncompressed document is still the largest with the lowest relevance. The goal is to maximize the context preservation from high relevance documents, even if the documents are large. But getting the cosine similarity requires embedding every document, even if the document isn't chosen as a victim for compression in the final model call, which means I'm paying for embeddings I don't end up needing. 

I'm trying to measure the candidate model call size against the model's input window, and only select one document at a time for compression, so that I can send the least-compressed version of the model call. The intent is to compress the largest, least relevant document, replace it with the compressed version, measure if it'll fit, and stop compressing candidates the moment the call is small enough. 

I would like to only have to embed the next-victim, not get embeddings for all of them, then use the embedding product to select the next victim. 

How can I select victims based on the product of the largest size and lowest relevance without having to first get embeddings for all candidates before I select which candidates are selected to use the compressed version in the final call?

The plan has a chicken-and-egg problem: you can't know which document has the *lowest relevance* without measuring relevance for every candidate first. "Only embed the next victim" and "select next victim based on relevance" are mutually exclusive unless you get relevance from somewhere other than the embedding client.

So the fix isn't a clever way to defer embedding — it's decoupling ranking from the expensive measurement.

**1. Use a free/cheap proxy for the initial ranking, not the embedding API.**

Cosine similarity between a doc and the query/task doesn't require a paid embedding call to approximate. Options, cheapest first:
- BM25 or TF-IDF cosine similarity computed locally against the agent's task/query text.
- MinHash/SimHash for a rough semantic-ish signal if you want something embedding-adjacent without API cost.
- A local, free embedding model (e.g. a small sentence-transformers model run on CPU) if you want vector cosine sim without hitting a metered API.

Compute `score = size * (1 / proxy_relevance)` for every candidate up front — this is basically free. Sort once. This gives you your full ranking without a single paid embedding call.

**2. Reserve the paid embedding client for verification, not discovery.**

If you don't trust the proxy enough to compress blind, only call your real embedding client on the document the proxy says is the current victim, right before you compress it — to confirm it's actually low-relevance before you commit to lossy compression. That's the "only embed what you're about to victimize" behavior you actually want, and it's achievable because the *selection* no longer depends on the embedding client at all.

**3. Note that relevance doesn't need to be recomputed per iteration.**

Relevance (proxy or real) is static per document relative to the task — compressing document A doesn't change document B's relevance. So the expensive part of your loop shouldn't be "re-embed everything each round to find the next victim." Compute proxy-relevance once, cache it, and each iteration just re-sorts by `remaining_size * (1/relevance)` using cached scores — size shrinks after compression, relevance doesn't. The only thing that should touch your paid embedding client is the one-time verification step in #2, and even that's optional if you trust the proxy.

**4. Practical loop:**

```
scores = [(doc, size(doc) / proxy_relevance(doc)) for doc in candidates]  # one cheap pass
sort descending by score
while call_size(current_docs) > context_window:
    victim = highest-scoring uncompressed doc
    (optional) verify with real embedding client
    compressed = compress(victim)
    replace victim with compressed in current_docs
    remove victim from further consideration (or re-score with new size)
```

This gets you exactly the behavior you described — incremental, stop-the-moment-it-fits, minimum compression — without ever needing embeddings for documents that don't get touched, because the ranking signal was never coming from the paid embedding client in the first place.

The one thing to be honest about: if your organization's definition of "relevance" specifically means "cosine similarity from this particular embedding model" (e.g., because downstream retrieval logic depends on that exact metric matching), then a TF-IDF proxy is an approximation, not identical — you're trading a small amount of ranking fidelity for not paying to embed documents you're going to throw away anyway. That's almost certainly the right trade, but it's worth being explicit that it's a proxy, not the same number.