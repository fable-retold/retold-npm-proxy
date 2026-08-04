# retold-npm-proxy

Command-line control for the [Retold registry](../../../registry) -- the local npm
pull-through cache and private-package host. A thin, decoupled companion: the registry
runs fine on its own (`npm start` / `docker compose up`), and this tool is a convenience
surface over it. Built the same way as `retold-monorepo-manager`
(`pict-service-commandlineutility`), so the two read identically.

```
rnp status                     # is it up? where is it? how big is the warehouse?
rnp start [--docker]           # start it (direct verdaccio, or docker compose)
rnp stop  [--docker]           # stop it
rnp use <url>|local|off        # point npm + rnp at a registry (rewrites .npmrc + config)
rnp where                      # show where npm and rnp currently point
rnp warehouse [--root <dir>]   # mirror the whole monorepo dependency closure into storage
rnp publish <module-dir>       # publish a private retold package into it (see below)
```

(`rnp` and `retold-npm-proxy` are the same bin.)

## Documentation

Full docs with examples live in [`docs/`](docs/) (Overview, Quick Start, How It Works,
Warehouse & Offline, Publishing Private Packages, Configuration, Docker, and the CLI
Reference). Build or serve them with `npm run docs` / `npm run docs-serve`.

## Why `publish` is the point

`npm publish` refuses a package marked `private: true`, and every retold module keeps
that flag on purpose so nothing lands on public npm by accident. `rnp publish` gets a
package into the *local* registry anyway, without touching its `package.json`:

1. `npm pack` the module (pack is happy to tar a private package) -- exact tarball,
   plus npm's own shasum + integrity.
2. PUT the packument straight to Verdaccio, with `private` dropped from the published
   metadata. Verdaccio has no private guard of its own.

So the module stays `private: true` on disk (guardrail intact), and consumers install it
as an ordinary caret dependency -- no symlink, no `file:` path, no idea it is local code.

## How it finds the registry

Auto-discovers `registry/config.yaml` by walking up from the cwd, then falls back to the
copy shipped in this monorepo. Override with `--registry-dir <path>`,
`RETOLD_REGISTRY_DIR`, or `RegistryDirectory` in `.retold-npm-proxy.json`. The registry
URL defaults to `http://localhost:4873` (`--url`, or `RegistryURL` in config).

## Auth

None worth the name: publishing needs a bearer token, so the tool registers a throwaway
publisher against Verdaccio's htpasswd and caches it in `.retold-npm-proxy-token`
(gitignored). No login dance, no accounts.
