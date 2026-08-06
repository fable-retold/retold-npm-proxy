# CLI Reference

```
rnp <command> [args] [options]
```

Two bin names are installed and interchangeable: `retold-npm-proxy` and `rnp`.

**Common options** (accepted where relevant):

| Option | Meaning |
|---|---|
| `--registry-dir <path>` | The registry folder to drive. Default: auto-discover `registry/config.yaml` upward from cwd, then the copy in the retold umbrella. |
| `--url <url>` | The running registry URL. Default `http://localhost:4873`. |

Any option can also be set in a `.retold-npm-proxy.json` config file or an environment
variable. See [Configuration](configuration.md).

---

## `rnp status`

Report whether the registry is up, where it is, and how big the warehouse is. Exits
non-zero when the registry is down (useful in scripts).

```bash
rnp status
```

```
Registry dir: /Users/you/Code/retold/registry
URL:          http://localhost:4873
Status:       UP
Warehouse:    307 tarball(s) across 284 package(s), 54.4 MB
```

When it is down:

```
Status:       down

Start it with:  rnp start        (or `rnp start --docker`)
```

---

## `rnp use`

Point npm **and** this tool at a registry (or off) in one move. It rewrites the `registry=`
line in the `.npmrc` and the `RegistryURL` in `.retold-npm-proxy.json` together, then pings the
target so you know it answers. This is the client half of the setup, the counterpart to
`start`/`stop` on the server side. Use it to switch between a laptop-local registry, a shared one
on a NAS, and plain public npm.

| Option | Meaning |
|---|---|
| `--global` | Write `~/.npmrc` and `~/.retold-npm-proxy.json` instead of the monorepo root. |

```bash
rnp use http://nas.local:4873   # a full URL...
rnp use nas.local               # ...or a bare host (defaults to :4873)
rnp use local                   # shortcut for http://localhost:4873
rnp use off                     # remove the line -> back to public npm
```

```
Pointed at http://nas.local:4873
  npm  /Users/you/Code/retold/.npmrc
         registry=http://nas.local:4873/
  rnp  /Users/you/Code/retold/.retold-npm-proxy.json
         RegistryURL=http://nas.local:4873
  reachable: yes
```

The retold packages are unscoped, so one line redirects the whole registry. Mind npm's
local-prefix rule: the monorepo-root `.npmrc` governs npm run from the root and non-package
subdirs, but an install run **inside** a module reads that module's own `.npmrc`. Pass `--global`
to cover those too.

---

## `rnp where`

Show where npm and this tool currently point, and whether the target answers. Read-only.

```bash
rnp where
```

```
npm registry line (.npmrc):
  /Users/you/Code/retold/.npmrc
      registry=http://nas.local:4873/
  /Users/you/.npmrc
      (no registry line)
  npm effective, from /Users/you/Code/retold:
      http://nas.local:4873/

rnp target (.retold-npm-proxy.json RegistryURL):
  http://nas.local:4873
  reachable: UP
```

`npm effective` is what `npm config get registry` resolves from your current directory. It can
differ from the file line above because of the local-prefix rule: run `rnp where` from inside a
module and you may see that module's own (or the default public) registry instead.

---

## `rnp start`

Start the registry. Direct (runs the `verdaccio` installed in the registry folder) by
default, or under docker compose with `--docker`. Detached by default: it returns your
prompt and keeps running.

| Option | Meaning |
|---|---|
| `--docker` | Start via `docker compose up -d` instead of running verdaccio directly. |
| `--foreground` | Run in the foreground and block until Ctrl-C, instead of detaching. |
| `--port <n>` | Port for a direct start (default `4873`). |

```bash
rnp start
```

```
verdaccio started (pid 8937); log at /Users/you/Code/retold/registry/verdaccio.log
Registry is up at http://localhost:4873.
Point npm at it:  registry=http://localhost:4873/     Stop it:  rnp stop
```

If the registry is already answering, `start` is a no-op:

```
Registry already up at http://localhost:4873.
```

A direct start requires `verdaccio` to be installed in the registry folder
(`cd registry && npm install`). Use `--docker` to avoid that.

---

## `rnp stop`

Stop the registry.

| Option | Meaning |
|---|---|
| `--docker` | Stop a docker-compose registry (`docker compose down`). |
| `--port <n>` | Port to free for a direct stop (default `4873`). |

A direct stop frees the port by terminating whatever is listening on it, so it works no
matter how the server was started:

```bash
rnp stop
```

```
stopped pid(s) 8937 on :4873
```

---

## `rnp warehouse`

Mirror every tarball the monorepo references into the registry storage, building a
complete offline cache. Fetches each tarball **directly** through the proxy, so it does
not miss the packages npm would otherwise serve from its own client cache.

| Option | Meaning |
|---|---|
| `--root <path>` | Root to scan for `package-lock.json` files. Default: the monorepo root (the folder holding the registry). |
| `--concurrency <n>` | Parallel fetches (default `8`). |

```bash
rnp warehouse --root ~/Code/retold/modules/private/retold-application-foundation-server
```

```
Warehousing every lockfile under /Users/you/.../retold-application-foundation-server -> http://localhost:4873
  303/303  (ok 303, fail 0)
Lockfiles:    1
Unique deps:  303
Cached:       303
Failed:       0
```

With no `--root`, it warehouses the entire monorepo. It requires the registry to be
running, and exits non-zero if any tarball fails. See [Warehouse & Offline](warehouse.md).

---

## `rnp timemachine`

Mirror **every published version** of every package the monorepo references — not just the
one a lockfile pins right now (that is `warehouse`). It reads each package's packument through
the proxy (which lists every version and its tarball), then GETs every one of those tarballs so
they land in storage. After a full run, an old checkout whose `package.json` ranges resolve to
*older* versions installs straight from the proxy — and the proxy becomes the source of record,
so a new store can be seeded from it without touching public npm again.

Only **direct** references are expanded (the names that appear in a `package.json`); a version's
own transitive deps are pulled on demand the first time something actually installs it.

It is a **big** pull — hundreds of packages, tens of thousands of versions, tens of GB. Run
`--plan` first to preview the scope, and let the resume file make it safely interruptible.

| Option | Meaning |
|---|---|
| `--plan` | Count packages and versions and stop — preview the scope without fetching anything. |
| `--stable-only` | Skip prerelease versions (anything with a `-`: `-beta.1`, `-rc.2`, `-canary.4`, …). |
| `--git-history` | Also harvest dependency names from **every `package.json` across git history** — every repo, all refs, including nested example apps — so a dep only an old commit referenced (since removed or renamed) is captured too. Bigger. |
| `--root <path>` | Root to scan for `package.json` files. Default: the monorepo root. |
| `--concurrency <n>` | Parallel fetches (default `8`). |
| `--resume <path>` | Progress file that lets a re-run skip already-cached tarballs. Default `<root>/.rnp-timemachine-progress`. |

Preview first — no fetching, just the scope:

```bash
rnp timemachine --plan
```

```
Planning every referenced package version under /Users/you/Code/retold
  registry: http://localhost:4873
  reading metadata 376/376

Packages referenced: 376
Versions (tarballs): 65029
No public metadata:  2 (private/unpublished -- skipped): fable3, orator6

That is the scope. Run without --plan to pull them all (resumable; big -- expect tens of GB and a long run).
```

Then pull it — here against a shared NAS registry, harvesting git history too:

```bash
rnp timemachine --git-history --url http://nas.local:4873 --root ~/Code/retold --concurrency 16
```

```
Time-machining every referenced package version under /Users/you/Code/retold
  registry: http://nas.local:4873
  scanning git history 147/147 repos
  reading metadata 437/437
  tarballs 69601/69601  (ok 69588, fail 13)
  FAIL  HTTP 404  http://nas.local:4873/@types/node/-/node-9.4.2.tgz
  ...

Packages referenced: 437  (+61 from git history)
Versions (tarballs): 69601
No public metadata:  5 (private/unpublished -- skipped): fable3, orator2, orator6, pict-section-claudetransformer, retold-data
Cached:              69588
Failed:              13
  HTTP 404  http://nas.local:4873/@types/node/-/node-9.4.2.tgz
  HTTP 404  http://nas.local:4873/firebase/-/firebase-0.0.0.tgz
  ...
(full list also written to <resume-file>.failures)
```

**Resumable.** As each tarball lands it is appended to the progress file; a re-run skips
everything already recorded and re-attempts only what is left — so an interruption (or a
transient drop) costs nothing but the retry. The file records *successes* only, which means
running the same command again is also how you retry the failures.

**Failures are expected — and logged.** Each failing tarball prints live as `FAIL <reason>
<url>`, and every failure of the run is written fresh to `<resume-file>.failures`. Almost all are
`HTTP 404`: a version the packument still lists but whose tarball npm has since unpublished —
gone from npm entirely, so nothing to recover. A `terminated` reason is different: the connection
dropped mid-transfer (a big tarball over a slow link), and a re-run usually pulls it cleanly. Any
failure sets a non-zero exit code.

**No public metadata.** Packages whose packument the proxy cannot fetch — your own
`private: true` modules, or `npm:`-aliased names like `fable3` / `orator6` — are listed and
skipped; there is nothing to time-machine for them (the alias targets, e.g. `fable`, are already
covered under their real names).

`timemachine` is the all-versions sibling of [`rnp warehouse`](#rnp-warehouse), which mirrors
only the versions the lockfiles pin today. See [Warehouse & Offline](warehouse.md) for the
offline-cache story.

---

## `rnp publish`

Publish a private retold package into the local registry, preserving its
`private: true` (the source `package.json` is never modified). Uses a direct tarball PUT.

```
rnp publish <module-dir> [--tag <tag>]
```

| Option | Meaning |
|---|---|
| `--tag <tag>` | dist-tag to publish under (default `latest`). |

```bash
rnp publish ~/Code/retold/modules/private/retold-deploy-tool
```

```
Published retold-deploy-tool@0.0.1 -> http://localhost:4873
  tarball: retold-deploy-tool-0.0.1.tgz  (source package.json untouched -- still private:true)
```

The first publish registers a throwaway publisher account on the registry to get a token
and caches it (see [Configuration](configuration.md)). See
[Publishing Private Packages](publishing.md) for the mechanism and for consuming the
result.
