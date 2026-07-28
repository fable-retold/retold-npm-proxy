# Publishing Private Packages

The whole reason `rnp publish` exists: get a `private: true` package into your **local**
registry, without editing the package and without it ever being able to reach public
npm.

## The problem

Every retold module keeps `"private": true` in its `package.json`. That is deliberate:
it is a guardrail so nothing lands on public npm by accident, and there is a test that
enforces it. But `npm publish` refuses any package with that flag set:

```
npm error This package has been marked as private
```

So you cannot use plain `npm publish` to put these modules into your local registry
either. You do not want to remove the flag (that removes the guardrail), and you do not
want a `publishConfig` juggling act.

## What `rnp publish` does

It does what npm does under the hood, minus the client-side private check:

1. **`npm pack`** the module. `pack` is happy to tar a private package, and it produces
   the exact publishable tarball plus npm's own `shasum` and `integrity`.
2. **PUT the packument** (the registry metadata document, with the tarball attached as
   base64) straight to Verdaccio. Verdaccio has no private guard of its own, so it
   accepts it.

The `private` field is dropped from the *published* version metadata, so the record in
the registry is clean. The module's `package.json` **on disk is never touched**, so the
`private: true` guardrail stays intact.

```bash
rnp publish ~/Code/retold/modules/private/retold-application-foundation-server
```

```
Published retold-application-foundation-server@0.0.1 -> http://localhost:4873
  tarball: retold-application-foundation-server-0.0.1.tgz  (source package.json untouched -- still private:true)
```

You can confirm both halves:

```bash
# the registry serves it
curl -s http://localhost:4873/retold-application-foundation-server | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(Object.keys(JSON.parse(s).versions)))"
# [ '0.0.1' ]

# the source is still private
node -e "console.log(require('.../retold-application-foundation-server/package.json').private)"
# true
```

## Consuming it

Once published, any project pointed at the registry installs it as an ordinary caret
dependency. No `npm link`, no `file:` path, no knowledge that it is local:

```bash
mkdir consumer && cd consumer
echo 'registry=http://localhost:4873/' > .npmrc
npm init -y >/dev/null
npm install retold-application-foundation-server
```

```
added 231 packages in 9s
```

The package is a real directory in `node_modules`, and its whole public dependency tree
resolves through the proxy. This is what lets the retold modules depend on each other by
version instead of by symlink.

## Auth (such as it is)

Publishing needs a bearer token, so on the first publish `rnp` registers a throwaway
publisher account against the registry's htpasswd and caches the token in
`.retold-npm-proxy-token` (gitignored, next to the tool). There is no login flow, no
email, no org. If the token ever goes stale, `rnp` transparently gets a new one. The
account name and password are configurable (`PublisherUser` / `PublisherPassword`, see
[Configuration](configuration.md)) but the defaults are fine for a local cache.

## Versions are immutable

A registry treats a given `name@version` as final. To publish changed code, bump the
version first (for example with `npm version patch --no-git-tag-version`, or
`mm version <module> patch` from retold-monorepo-manager) and publish again. Re-publishing
the same version is rejected, which is the registry protecting you from a silent
mismatch.
