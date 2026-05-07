---
description: Explore a specific file and document it in CODE.md
argument-hint: "<file-path> [instructions]"
---

Read the file/directory `$1` thoroughly.
Then also read any other files it is closely coupled to, such as imports and users.

After thatm we will need to add / update the secion for this file/dir in `CODE.md`.

We need extremely high signal to noise ratio, which means you need to decide on what's most important.
Allocate less space for the normal and expected, more space for things that are unusual, unepected, and stand out in other ways.

The section may follow this structure, but be flexible with it, adjust for the file you are exploring. All items there are optinoal,
and should be skipped if they don't contribute to understanding.

```markdown
# Files

...

## [`path/to/file.py`](path/to/file.py) — Short description of its role

A one-paragraph summary of what this file does and why it matters in the project.

[optionally]: a table of closely coupled files (only important ones), path and description in context of this file.

A free-form descriptioon of what's going on in the file. I suggest the

What's the purpose

How it works (in detail)

What's unusual / stands out.

but it's up to you in the end.
```

This description is expected to vary in length between files. Simple files may only require a few lines - just the top-level description
Large files with lots of complexity may need pages. Feel free to invent new sections - Err on the side of brievety.

Once you have a complete understanding, add a new section to CODE.md for this file.

You may also add sections for the other files you had to refrence, but they don't need to be exhaustive.

Make sure we use markdown links for files, you can use `[file.py:123](file.py#123)` to refer line numbers, make sure the file paths are relative to `CODE.md`

Additional instructions (if any):
${@:1}
