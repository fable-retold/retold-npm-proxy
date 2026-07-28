# How It Works

## The registry

Underneath `rnp` is a [Verdaccio](https://verdaccio.org/) instance: a small,
single-process npm registry. It is configured to be **local-first with a pull-through
uplink**:

```
  npm install <anything>
        |
        v
  +-----------------------------+       hit (local or cached)
  |   local registry (:4873)    |----------------------------> serve from ./storage
  |   local-first, proxy npmjs  |
  +-----------------------------+
        |  miss
        v
  registry.npmjs.org  ---- fetch, then WAREHOUSE the tarball in ./storage forever
```

- A package published **locally** (your retold modules) is served from `./storage` and
  always wins.
- Anything else is fetched from npmjs on first request and the tarball is kept in
  `./storage`. The second request, on this machine or any machine you copy `./storage`
  to, is served locally.

That is the whole idea: your own packages and the entire public dependency closure end
up in one folder you control.

## Unscoped routing

The retold packages are **unscoped** (`retold-application-foundation-server`, not
`@retold/...`). So pointing npm at the registry is a **global** redirect:

```
registry=http://localhost:4873/
```

Every install now flows through the proxy, which is a superset of npmjs: it serves your
local packages and transparently proxies plus caches the public ones. The tradeoff is
that the registry has to be running for installs to work. When it is stopped, remove or
comment that `.npmrc` line and you are back on vanilla npm.

(A scoped setup, `@scope:registry=...`, would route only that scope to the local
registry and leave everything else on npmjs. The retold modules chose unscoped, so the
whole registry is redirected.)

## The warehouse, and the one gotcha

"Warehouse" means the tarballs sitting in `./storage`. It fills two ways:

- **Lazily**, as a side effect of installing through the proxy.
- **Eagerly and completely**, with `rnp warehouse`, which walks every `package-lock.json`
  and pulls each referenced tarball.

The gotcha worth knowing: **`npm install` does not reliably fill the warehouse.** npm
keeps its own client cache (`~/.npm/_cacache`) and will serve a tarball from there
without ever asking the proxy. So an install can pull 200 packages while the warehouse
grows by only a handful. That is expected, and it is exactly why `rnp warehouse` exists:
it fetches tarballs **directly** through the proxy, bypassing npm's cache, so the mirror
is actually complete.

Rule of thumb:

- **`npm install`** to *consume* packages (local-first, transparent).
- **`rnp warehouse`** to *build the mirror* (complete, portable, offline).

See [Warehouse & Offline](warehouse.md).

## Publishing private packages

`npm publish` refuses a package marked `private: true`, and every retold module keeps
that flag on purpose. `rnp publish` sidesteps the client-side guard without touching the
package: it runs `npm pack` (which is happy to tar a private package), then PUTs the
resulting tarball straight to Verdaccio, which has no private guard of its own. The
`private` field is dropped from the *published* metadata; the `package.json` on disk is
never modified. See [Publishing Private Packages](publishing.md).

## Decoupled by design

`rnp` never imports the registry. It locates the registry folder, drives that folder's
own `verdaccio` / `docker compose`, and talks to the running server over HTTP. So:

- The **registry** runs without `rnp`: `cd registry && npm start`, or `docker compose up`.
- **`rnp`** is a convenience layer over it: start/stop/status, warehouse, publish.

Each works on its own. `rnp` just makes the common operations one word each.

## Relationship to retold-monorepo-manager

`rnp` is a companion to
[`retold-monorepo-manager`](https://github.com/fable-retold/retold-monorepo-manager)
(`mm`) and is built the same way (both are `pict-service-commandlineutility` CLIs with a
declarative command map). They are independent: `mm` manages the modules and their
git/version/publish lifecycle; `rnp` runs the registry those modules publish into and
install from. Use either without the other.
