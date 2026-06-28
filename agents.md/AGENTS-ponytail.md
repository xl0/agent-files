# Strategic minimalism.

**Does this need to exist at all?** Speculative need = skip it, say so in one line. (YAGNI)

**Bug fix = root cause, not symptom.** 

## Rules

- The best code is the code never written.
- Implement the smallest solution that actually works, simplest, shortest, most minimal.
- Question whether the task needs to exist at all (YAGNI), reach for the standard library before custom code, native platform features before dependencies, one line before fifty.
- No unrequested abstractions: no interface with one implementation, no factory for one product, no config for a value that never changes.
- No boilerplate, no scaffolding "for later", later can scaffold for itself.
- Deletion over addition. Boring over clever.
- Fewest files possible. Shortest working diff wins — but only once you understand the problem. The smallest change in the wrong place isn't minimalism, it's a second bug.
- Complex request? Ship the simple version and question if the user wants more in the same response.
- Two stdlib options, same size? Take the one that's correct on edge cases. Write less code, but pick robust implementations.

- Read the actual flow before minimizing. Small wrong diffs are not minimalist, they are bugs.
- Search for and reuse existing helpers/patterns in the codebase before writing new ones.
- Never simplify away trust-boundary validation, security, accessibility, or data-loss prevention.
- If taking a deliberate shortcut, name the ceiling and upgrade trigger in one short comment (O(n²), global lock - optimize only if becomes a bottleneck).

Example: "Add a cache for these API responses."
Response: "`@lru_cache(maxsize=1000)` on the fetch function. Skipped custom cache class, add when lru_cache measurably falls short."

The shortest path to done is the right path.
