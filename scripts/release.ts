/**
 * Cuts a release of one pi package: rolls its changelog over, bumps its
 * version, verifies, commits, tags and pushes.
 *
 *   bun scripts/release.ts <package> [patch|minor|major|x.y.z] [--no-push]
 *
 * `<package>` is a directory under `pi/packages/` (e.g. pi-lovely-rename).
 * Packages version independently; each release is tagged `<package>-v<ver>`.
 * The tag push triggers `.github/workflows/publish.yml`, which stages the
 * build on npm and creates the GitHub Release. The script then waits for the
 * staged version to appear, asks for a 2FA code and approves it — that
 * approval is what actually publishes. Once the changelog/version edits are
 * prepared, the script pauses with a summary and asks before committing —
 * that is the point to inspect the diff; declining reverts the edits.
 * `--no-push` stops after the commit+tag. Nothing reaches npm until pushed.
 *
 * Changelog entries are written by hand before releasing — everything here is
 * mechanical, which is what makes the unattended push at the end acceptable.
 */

import { $ } from "bun"
import { existsSync } from "node:fs"

const die = (msg: string): never => {
	console.error(msg)
	process.exit(1)
}

const parse = (v: string) => {
	const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/)
	return m ? ([Number(m[1]), Number(m[2]), Number(m[3])] as const) : null
}

const cmp = (a: readonly number[], b: readonly number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

// Everything below assumes repo-root-relative paths; allow invocation from
// a package directory (`bun run release`) by normalizing to the root.
process.chdir((await $`git rev-parse --show-toplevel`.text()).trim())

const args = process.argv.slice(2)
const push = !args.includes("--no-push")
const positional = args.filter(arg => !arg.startsWith("-"))
const [pkg, target = "patch"] = positional
if (!pkg || positional.length > 2)
	die("usage: bun scripts/release.ts <package> [patch|minor|major|x.y.z] [--no-push]")

const dir = `pi/packages/${pkg}`
if (!existsSync(`${dir}/package.json`)) die(`${dir}/package.json not found`)

const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim()
if (branch !== "master") die(`on ${branch}; releases are cut from master`)

// Unrelated uncommitted files are fine — the release commit stages only this
// package's changelog and manifests — but list them so nothing rides along
// unnoticed. The release-managed files themselves must be clean: their
// working-tree state gets swept into the release commit.
const releaseFiles = [`${dir}/CHANGELOG.md`, `${dir}/package.json`]
const dirty = (await $`git status --porcelain`.text())
	.split("\n")
	.filter(line => line.trim() !== "" && !line.startsWith("??"))
if (dirty.length > 0) {
	const clashes = dirty.filter(line => releaseFiles.includes(line.slice(3)))
	if (clashes.length > 0)
		die(`uncommitted changes to release-managed files; commit or stash first:\n${clashes.join("\n")}`)
	console.log(`worktree has uncommitted files (left alone by the release):\n${dirty.join("\n")}\n`)
}

// The approval at the end needs an npm login; check before touching anything.
if (push && (await $`npm whoami`.nothrow().quiet()).exitCode !== 0)
	die("not logged in to npm (needed to approve the staged release); run npm login first")

const pkgText = await Bun.file(`${dir}/package.json`).text()
const manifest = JSON.parse(pkgText)
const name = manifest.name as string
const current = (manifest.version ?? "") as string
const cur = parse(current) ?? die(`${dir} version ${current} is not semver`)

let version: string
if (target === "patch") version = `${cur[0]}.${cur[1]}.${cur[2] + 1}`
else if (target === "minor") version = `${cur[0]}.${cur[1] + 1}.0`
else if (target === "major") version = `${cur[0] + 1}.0.0`
else {
	const explicit = parse(target) ?? die(`not a bump type or a semver version: ${target}`)
	if (cmp(explicit, cur) <= 0) die(`${target} is not greater than the current ${current}`)
	version = target
}

const tag = `${pkg}-v${version}`
if ((await $`git tag -l ${tag}`.text()).trim()) die(`tag ${tag} already exists`)

const onNpm = await $`npm view ${`${name}@${version}`} version`.nothrow().quiet()
if (onNpm.exitCode === 0 && onNpm.stdout.toString().trim()) die(`${name}@${version} is already published to npm`)

// The [Unreleased] body runs to the next `## [` heading; refuse a release that
// would carry no entries rather than tagging an empty section.
const changelogPath = `${dir}/CHANGELOG.md`
const changelog = await Bun.file(changelogPath).text()
const heading = "## [Unreleased]"
const start = changelog.indexOf(heading)
if (start < 0) die(`${changelogPath} has no [Unreleased] section`)
const rest = changelog.slice(start + heading.length)
const nextHeading = rest.search(/^## \[/m)
if (!/^- /m.test(nextHeading < 0 ? rest : rest.slice(0, nextHeading)))
	die("[Unreleased] has no entries — write the changelog first")

// Verify before touching any files — a failure here must leave the worktree
// clean, or re-runs hit the dirty-files guard with a half-applied bump.
console.log(`\n=== verifying ${name} @ ${version} ===\n`)
await $`bun run check`.cwd(dir)
await $`npm pack --dry-run`.cwd(dir)

const date = new Date().toISOString().slice(0, 10)
await Bun.write(changelogPath, changelog.replace(`${heading}\n`, `${heading}\n\n## [${version}] - ${date}\n`))

const bumped = pkgText.replace(`"version": "${current}"`, `"version": "${version}"`)
if (bumped === pkgText) die(`could not rewrite the version in ${dir}/package.json`)
await Bun.write(`${dir}/package.json`, bumped)

// Inspection gate: everything is prepared but uncommitted. Show what the
// release is and confirm before committing; declining reverts the edits.
console.log(`\n=== review ${tag} ===\n`)
await $`git diff ${releaseFiles}`
const go = prompt(`\ncommit and tag ${tag}${push ? ", push, and kick off the CI publish" : ""}? [y/N]`)
	?.trim()
	.toLowerCase()
if (go !== "y" && go !== "yes") {
	await $`git checkout -- ${releaseFiles}`
	console.log("Reverted the prepared changes; nothing was committed.")
	process.exit(0)
}

console.log(`\n=== committing and tagging ${tag} ===\n`)
await $`git add ${releaseFiles}`
await $`git commit -m ${`chore(release): ${pkg} ${version}`}`
await $`git tag -a ${tag} -m ${`${name} ${version}`}`

if (!push) {
	console.log(`
Committed and tagged ${tag}; nothing was pushed. Publish later with:

  git push --no-follow-tags origin master && git push origin ${tag}

then approve what CI stages: npm stage list ${name} / npm stage approve <id>.
To abandon instead: git tag -d ${tag} && git reset --hard HEAD~1
`)
	process.exit(0)
}

console.log(`\n=== pushing ${tag} ===\n`)
// --no-follow-tags: push exactly this release's tag, whatever push.followTags
// is set to locally. An older unpushed tag would otherwise trigger its own run.
await $`git push --no-follow-tags origin master`
await $`git push origin ${tag}`

console.log(`\n=== waiting for CI to stage ${name}@${version} on npm ===\n`)
// CI runs in under a minute; ten is a hung workflow, not a slow one.
const deadline = Date.now() + 10 * 60 * 1000
let stageId: string | undefined
while (!stageId) {
	const list = await $`npm stage list ${name} --json`.nothrow().quiet()
	if (list.exitCode !== 0) die(`npm stage list failed:\n${list.stderr.toString()}`)
	const items = JSON.parse(list.stdout.toString()) as { id: string; version: string }[]
	stageId = items.find(item => item.version === version)?.id
	if (!stageId) {
		if (Date.now() > deadline)
			die(`timed out waiting for ${name}; check the workflow run, then npm stage list + npm stage approve <id>`)
		await Bun.sleep(10_000)
		process.stdout.write(".")
	}
}
console.log(`${name} staged as ${stageId}`)

for (let attempt = 1; ; attempt++) {
	const otp = prompt(`2FA code to approve and publish ${name}:`)?.trim()
	if (!otp) die(`no code entered; approve manually with: npm stage approve ${stageId}`)
	if ((await $`npm stage approve ${stageId} --otp ${otp}`.nothrow()).exitCode === 0) break
	if (attempt === 3) die(`approve manually with: npm stage approve ${stageId}`)
}

console.log(`\nApproved and published ${name}@${version}.\n`)
