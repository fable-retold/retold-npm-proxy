# Warehouse & Offline

The **warehouse** is the set of tarballs the registry keeps in `registry/storage/`. It
is a complete, portable copy of everything the monorepo depends on. This is the feature
that makes builds reproducible and immune to npm going down, unpublishing a version, or
not being reachable at all.

## Building a complete mirror

With the registry running:

```bash
rnp warehouse
```

That walks every `package-lock.json` under the monorepo, collects every unique registry
tarball, and pulls each one through the proxy so Verdaccio stores it. Scope it to a
subtree with `--root`:

```bash
rnp warehouse --root ~/Code/retold/modules/private/retold-application-foundation-server
```

```
Unique deps:  303
Cached:       303
Failed:       0
```

Check the result any time:

```bash
rnp status
```

```
Warehouse:    307 tarball(s) across 284 package(s), 54.4 MB
```

## Why not just install everything?

Because npm short-circuits its own downloads. npm keeps a client cache in
`~/.npm/_cacache`, and when a tarball is already there it serves it without ever asking
the proxy. So you can install a package with 200 dependencies and watch the warehouse
grow by 2, because npm had the other 198 cached locally.

That is not a bug, and it is the reason `rnp warehouse` fetches tarballs **directly**
through the proxy rather than relying on `npm install`. A worked example:

```
# install the chassis through the proxy
$ npm install retold-application-foundation-server
added 231 packages in 9s
$ rnp status
Warehouse:    124 tarball(s) ...        # only grew by 2 -- npm served the rest from its own cache

# now warehouse the same tree explicitly
$ rnp warehouse --root .../retold-application-foundation-server
Cached:       303
$ rnp status
Warehouse:    307 tarball(s) across 284 package(s), 54.4 MB   # complete
```

Rule of thumb: **install** to consume, **warehouse** to mirror.

## The portable / air-gap workflow

`registry/storage/` is a plain folder tree (Verdaccio's default filesystem storage). It
is portable: copy the whole folder and every `name@version` in it is served locally,
without going back to npm.

```bash
# on a connected machine: build the mirror
rnp warehouse

# copy the whole storage tree to a drive (both the metadata and the tarballs)
cp -R ~/Code/retold/registry/storage /Volumes/BRICK/retold-warehouse
```

On the sealed machine, drop that folder in as `registry/storage/`, start the registry,
and point npm at it. Anything in the warehouse installs with the internet turned off.

Three things to keep in mind for a true air-gap:

1. **Copy the whole storage tree**, not just the `.tgz` files. Per package Verdaccio
   keeps a metadata file plus the tarballs; the metadata is how it knows the version
   exists.
2. **Completeness is on you.** A version that was never warehoused still tries npm (and
   fails, offline). Run `rnp warehouse` over the whole monorepo so the closure is
   complete.
3. **Turn off the uplink for a strict air-gap.** By default, when online, Verdaccio may
   still contact npmjs to check for newer versions of proxied packages. It serves cached
   tarballs locally regardless and degrades gracefully offline, but if you want it to
   *never* reach out, remove the `npmjs` uplink from the `proxy:` rule in
   `registry/config.yaml` (or just run the machine offline). It then serves only what is
   in storage, and a genuine miss fails loudly, which is what you want in a vault.

## Not committed to git

`storage/` is gitignored on purpose. It is a rebuildable, potentially multi-gigabyte
artifact, not source: regenerate it any time from the lockfiles with `rnp warehouse`, or
carry it on a drive. What lives in git is the registry *config and scripts*, so the
recipe is versioned while the bytes are not.
