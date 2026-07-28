# Retold NPM Proxy

> One command in front of a local npm registry: host your private packages, warehouse everything else, and never fight enterprise npm again.

- **Private packages, no accounts** hosts the retold modules in a local registry so they install as ordinary caret dependencies, not `npm link` symlinks
- **Warehouse everything** mirrors every tarball the monorepo references into local storage, so a second install never leaves the building
- **Offline and air-gap ready** copy the storage folder to a drive and a sealed box installs the whole tree with the internet turned off
- **Publish `private: true` packages** into the local registry via a direct tarball PUT, without touching their `package.json`
- **Docker or direct** start it either way; both share one config and one warehouse on disk
- **Companion to retold-monorepo-manager** built the same way, works on its own

[GitHub](https://github.com/fable-retold/retold-npm-proxy)
[Get Started](quickstart.md)
