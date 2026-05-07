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
| [`src/krea_pretrain/`](src/krea_pretrain/) | Core library: DiT, autoencoders, text encoders, LoRA, sampling/solvers, parallelism/TP, FP8 quantization |
| [`rl_utils/`](rl_utils/) | Shared RL infra: Pydantic configs, GDPO/GARDO, reward registry, con-solver variant |
| [`configs/`](configs/) | YAML configs grouped by stage: [`debug/`](configs/debug/), [`scaling/adamw/`](configs/scaling/adamw/), sft/, arch/, dpo/, infer/, plus `dnft_*.
...

## Core Library [`src/krea_pretrain/`](src/krea_pretrain/)

| Module | Purpose |
|---|---|
| [`mmdit.py`](src/krea_pretrain/mmdit.py) | **The DiT model** — `SingleStreamDiT` (single-stream MMDiT architecture). Configurable via `SingleMMDiTConfig`. Contains FSDP2 and TP parallelisation functions |
| [`modules.py`](src/krea_pretrain/modules.py) | Building blocks: Attention, SwiGLU, RMSNorm/LayerNorm, SharedModulation, PositionalEncoding, LastLayer, Registers, TextFusionTransformer |
| [`math.py`](src/krea_pretrain/math.py) | RoPE implementation and attention dispatch (Flash/Varlen, FlexAttention, SDPA) |
| [`pipeline.py`](src/krea_pretrain/pipeline.py) | `Sampler` class — full flow-matching inference pipeline: encode → ODE solve → decode |
...

## RL Infrastructure [`rl_utils/`](rl_utils/)

| File | Purpose |
|---|---|
| [`config.py`](rl_utils/config.py) | Shared Pydantic configs: `DataConfig`, `FSDPConfig` (dp, shard, gp), `FlowMatchConfig`, `SampleConfig`, `EMAConfig`, `DITConfig`, `DNFTConfig`, `SRPOConfig`, `CFGConfig`, `LoRAConfig`, `WandbConfig` |
| [`gdpo.py`](rl_utils/gdpo.py) | GDPO advantage computation: `gdpo_advantages()`, `RewardEMAScaler` (per-reward EMA global std), `select_oversample_indices()` |
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