# Matching evaluation

The production matcher keeps the existing explainable skill-coverage score and
adds a bounded semantic similarity feature over the confirmed qualifications,
job title, description, and listed skills. The result exposes `semanticScore`,
`matched`, `missing`, and evidence reasons. Missing resume sections produce an
empty qualification string and therefore do not invent matches.

## Evaluation protocol

Use the same labeled resume-job pairs for both systems. The baseline is the
keyword-only score; the candidate is the keyword score plus description-aware
semantic similarity. Report Precision@5 and nDCG@5 for each profile, then the
macro average. The ranking implementation is deterministic, so the fixture can
be replayed in CI without network access.

Sentence-BERT evaluation is intentionally separate from request-time matching:
the recommended pretrained model is `sentence-transformers/all-MiniLM-L6-v2`.
Run the offline benchmark in the model-evaluation environment, record the
model version and dataset hash here, and promote it only if its macro nDCG@5
beats the candidate matcher without unacceptable latency or data-transfer
cost. No model weights or user resume text are committed to this repository.

The current Node matcher remains the privacy-preserving fallback when the
optional model evaluation/runtime is unavailable.