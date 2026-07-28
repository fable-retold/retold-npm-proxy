# Retold NPM Proxy

`retold-npm-proxy` (bin: **`rnp`**) is the command-line control for a local npm
registry and pull-through cache. It does two jobs that normally require standing up
"real" enterprise npm, without any of that pain:

1. **Hosts private packages.** Your modules install each other as ordinary caret
   dependencies (`retold-application-foundation-server@^0.0.1`) instead of `npm link`
   symlinks or `file:` paths. A consumer never knows a dependency came from the local
   registry rather than npmjs.
2. **Warehouses every tarball** the monorepo references. On a cache miss it fetches
   from npmjs and keeps the tarball forever. Copy the storage folder to a drive and a
   sealed, offline machine installs the whole tree with the internet turned off.

No accounts, no tokens to provision, no SSO. That entire class of problem is the thing
this exists to avoid.

## The two pieces

`rnp` is deliberately thin and decoupled from the registry it drives:

```
  rnp <command>                      the CLI in this package (control)
      |
      | drives the folder's own verdaccio / docker,
      | and talks HTTP to the running server
      v
  registry/                          a Verdaccio config + storage (the registry)
    config.yaml   docker-compose.yml
    storage/      <- the warehouse (gitignored; portable)
```

- The **registry** (`registry/` in the retold umbrella) runs fine on its own:
  `npm start` or `docker compose up`. It is the actual pull-through cache and package
  host.
- **`rnp`** is a convenience surface over it: start/stop/status, warehouse, and
  publish. Neither needs the other; each works alone.

## A 30-second tour

```bash
rnp start                      # bring the registry up
rnp status                     # confirm it, see the warehouse size
rnp warehouse                  # mirror the whole monorepo's dependency tree
rnp publish ../some-private-pkg   # host a private package in it
rnp stop                       # done
```

Point a project at it by putting one line in `.npmrc`:

```
registry=http://localhost:4873/
```

Now every install is local-first: private packages come from the warehouse, public
packages proxy through and get cached.

## Where to go next

- **[Quick Start](quickstart.md)** install, start, publish, warehouse, consume.
- **[How It Works](concepts.md)** the registry, the warehouse, unscoped routing, and
  the one npm-cache gotcha to know.
- **[Warehouse & Offline](warehouse.md)** building a complete, portable, air-gap mirror.
- **[Publishing Private Packages](publishing.md)** the direct-PUT mechanism that keeps
  `private: true` intact.
- **[Configuration](configuration.md)** registry discovery, URLs, credentials, env vars.
- **[CLI Reference](cli-reference.md)** every command, option, and its output.
