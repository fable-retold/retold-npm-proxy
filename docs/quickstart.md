# Quick Start

## Install

```bash
npm install -g retold-npm-proxy
```

This installs two bin names, `retold-npm-proxy` and the short alias **`rnp`** used
throughout these docs. You can also run it without installing, via
`npx retold-npm-proxy <command>`.

`rnp` drives a **registry folder** (a Verdaccio config plus its storage). In the retold
umbrella that folder is `registry/`; `rnp` finds it automatically by walking up from
your current directory. See [Configuration](configuration.md) to point it elsewhere.

## 1. Start the registry

```bash
rnp start
```

```
verdaccio started (pid 8937); log at /Users/you/Code/retold/registry/verdaccio.log
Registry is up at http://localhost:4873.
Point npm at it:  registry=http://localhost:4873/     Stop it:  rnp stop
```

`rnp start --docker` runs it under docker compose instead; both share the same config
and the same storage on disk.

## 2. Point npm at it

The quick way, which also points `rnp` itself at the same registry:

```bash
rnp use local          # or `rnp use http://nas.local:4873` for a shared one
```

That rewrites the `registry=` line in your `.npmrc` and `RegistryURL` in
`.retold-npm-proxy.json` for you, then pings it. To do it by hand instead, add one line to a
project's `.npmrc` (or your `~/.npmrc`):

```
registry=http://localhost:4873/
```

Because the retold packages are **unscoped**, this redirects the whole registry: every
install goes through the proxy, which serves local packages from the warehouse and
proxies plus caches everything else. `rnp use off` (or removing that line) falls back to
vanilla npm; `rnp where` shows where you point right now.

## 3. Publish a private package into it

The retold modules are `private: true` so they never reach public npm by accident.
`rnp publish` gets one into the **local** registry anyway, without editing its
`package.json`:

```bash
rnp publish ~/Code/retold/modules/private/retold-application-foundation-server
```

```
Published retold-application-foundation-server@0.0.1 -> http://localhost:4873
  tarball: retold-application-foundation-server-0.0.1.tgz  (source package.json untouched -- still private:true)
```

See [Publishing Private Packages](publishing.md) for how that works.

## 4. Consume it, with no symlink

Any project pointed at the registry now installs it like a normal dependency:

```bash
mkdir consumer && cd consumer
echo 'registry=http://localhost:4873/' > .npmrc
npm init -y >/dev/null
npm install retold-application-foundation-server
```

```
added 231 packages in 9s
```

The package lands as a **real directory** in `node_modules`, not a symlink, and its
whole public dependency tree (fable, meadow, orator, and so on) resolves through the
proxy. The consumer has no idea it is local code.

## 5. Warehouse everything

Installing through the proxy caches what npm actually downloads, but npm often serves
tarballs from its own client cache and never hits the proxy. To build a **complete**
mirror, warehouse it explicitly:

```bash
rnp warehouse
```

```
Warehousing every lockfile under /Users/you/Code/retold -> http://localhost:4873
  303/303  (ok 303, fail 0)
Lockfiles:    1
Unique deps:  303
Cached:       303
Failed:       0
```

`rnp status` shows the result:

```
Registry dir: /Users/you/Code/retold/registry
URL:          http://localhost:4873
Status:       UP
Warehouse:    307 tarball(s) across 284 package(s), 54.4 MB
```

That storage folder is now a portable, offline mirror. See
[Warehouse & Offline](warehouse.md).

## 6. Stop it

```bash
rnp stop
```

```
stopped pid(s) 8937 on :4873
```
