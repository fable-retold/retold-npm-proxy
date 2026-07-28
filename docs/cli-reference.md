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
