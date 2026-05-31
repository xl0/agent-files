---
description: Explore and document the codebase
---

Thoroughly explore this codebase. Tell me what's here, how it works. Look at many files.
We need extremely high signal to noise ratio, which means you need to decide on what's most important.
Allocate less space for the normal and expected, more space for things that are unusual, unepected, and stand out in other ways.  

The description might resemble this format, but treat this as a mere suggesion. 

We can start with a project overview:

```markdown
## Project Overview

### What it does
[a few lines]
### How it works
[a few lines]
### Key design decisions
[a few lines]

### Weird tings and gotchas
[a few lines]
```

Then a top-level layout of the files/directories. One or more table.
Always include Path and Purpose/Notes, and you can use other columns as you prefer.
For example:

```markdown
## Table of Contents

| Path | Purpose |
|---|---|
| [`src/core/`](src/core/) | Core library: primary models/services, shared abstractions, execution pipeline, performance-critical utilities |
| [`src/training/`](src/training/) | Training/evaluation infrastructure: configs, distributed setup, metrics, checkpointing, reward or scoring utilities |
| [`configs/`](configs/) | YAML/TOML configs grouped by environment or stage: [`debug/`](configs/debug/), [`prod/`](configs/prod/), experiment presets, inference/evaluation settings |
...

## Core Library [`src/core/`](src/core/)

| Module | Purpose |
|---|---|
| [`model.py`](src/core/model.py) | Main model/service implementation and its configuration objects; note any distributed/parallelization hooks here |
| [`modules.py`](src/core/modules.py) | Reusable building blocks and domain abstractions used by the main implementation |
| [`math.py`](src/core/math.py) | Numeric algorithms, kernels, backend dispatch, or other low-level helpers |
| [`pipeline.py`](src/core/pipeline.py) | End-to-end runtime pipeline: input preparation → execution/solve/process → output decoding/formatting |
...

## Training / Evaluation Infrastructure [`src/training/`](src/training/)

| File | Purpose |
|---|---|
| [`config.py`](src/training/config.py) | Shared typed configs for data, distributed execution, optimization, sampling/evaluation, logging, and adapters/extensions |
| [`metrics.py`](src/training/metrics.py) | Metric/reward computation, normalization/scaling, selection/filtering helpers |
...

```

And so on. You may also group the items not just by path, for example:

```markdown
## Training Matrix

| Stage | Script | Config dir | Notes |
|---|---|---|---|
| Pretrain / midtrain / SFT | [`fsdp.py`](fsdp.py) | `configs/scaling/{adamw,muon,dion,mup}/`, `configs/sft/`, `configs/arch/`, `configs/debug/` | Flow-matching trainer, FSDP2; supports AdamW/Muon/Dion/μP. SFT is the same trainer with smaller LR + curated mixes |
| DPO | [`dpo.py`](dpo.py) ([`dpo.sh`](dpo.sh)) | [`configs/dpo/`](configs/dpo/) | Pairwise preference training on pre-scored rollouts |
| Inference | [`inference.py`](inference.py) | [`configs/infer/`](configs/infer/) | Multi-GPU sampling driver; CLI with many overrides |
...


## Supporting scripts

| Script | Purpose |
|---|---|
| [`convert_weights.py`](convert_weights.py) | Convert DCP↔safetensors; merge checkpoints with EMA/SMA averaging |
| [`mfu.py`](mfu.py) | MFU/throughput model + hardware peak TFLOPs table |
| [`utils.py`](utils.py) | `SeedManager`, `compile()`, distributed setup for RL scripts |
| [`single.sh`](single.sh) | Per-node launch script; auto-picks attention backend |
...

```

The tables doe not need to be exhaustive, skip noise and unimmportant files.

After the TOC, You may also include useful commands, like build/setup instructions. Again, pick the important bits.

Now, after you are done with your exhaustive review and summarization task, write the results to `CODE.md`.
If `CODE.md` already exists, update it with new findings.
Make sure we use markdown links for files, you can use `[file.py:123](file.py#123)` to refer line numbers, make sure the file paths are relative to `CODE.md`

Additinoal instructions (if any):
$ARGUMENTS