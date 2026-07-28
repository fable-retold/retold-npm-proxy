# Configuration

`rnp` needs to know two things: **which registry folder** to drive, and **which URL**
the running registry answers on. Both have sensible defaults, and both can be set three
ways, in priority order:

1. a command-line flag,
2. an environment variable,
3. a `.retold-npm-proxy.json` config file (gathered automatically, walking up from cwd).

## Finding the registry folder

The registry folder holds `config.yaml`, `docker-compose.yml`, and `storage/`. `rnp`
resolves it in this order:

1. `--registry-dir <path>` on the command line.
2. `RETOLD_REGISTRY_DIR` in the environment.
3. Walk up from the current directory looking for a `registry/config.yaml`.
4. Fall back to the `registry/` folder shipped in the retold umbrella (relative to the
   installed tool).

```bash
rnp status --registry-dir /opt/retold/registry
# or
RETOLD_REGISTRY_DIR=/opt/retold/registry rnp status
```

## The registry URL

Everything (`status`, `warehouse`, `publish`) talks to a running registry over HTTP.

- Flag: `--url http://host:4873`
- Config: `"RegistryURL": "http://host:4873"`
- Default: `http://localhost:4873`

The `--port` option on `start` / `stop` sets the port for a **direct** launch; `--url`
is what the other commands connect to. Keep them consistent if you move off the default
port.

## The config file

`rnp` auto-gathers a `.retold-npm-proxy.json` (searching upward from cwd, same as the
manager's `.monorepo-manager.json`). Every field is optional:

```json
{
	"RegistryDirectory": "",
	"RegistryURL": "http://localhost:4873",
	"PublisherUser": "retold-local",
	"PublisherPassword": "retold-local"
}
```

| Field | Purpose |
|---|---|
| `RegistryDirectory` | Pin the registry folder (empty = auto-discover). |
| `RegistryURL` | The running registry's URL. |
| `PublisherUser` / `PublisherPassword` | The throwaway account `rnp` registers to get a publish token. Convenience credentials for a local cache, not a secret. |

## Pointing npm at the registry

That is npm's config, not `rnp`'s, but it is the other half of the setup. Put one line in
a project `.npmrc` (or your `~/.npmrc`):

```
registry=http://localhost:4873/
```

The retold packages are unscoped, so this redirects the whole registry (local-first,
proxying and caching everything else). The registry ships a `.npmrc.example` you can copy.
When the registry is stopped, remove or comment that line to return to vanilla npm.

## The token cache

The first `rnp publish` writes a `.retold-npm-proxy-token` file next to the tool and
reuses it afterward. It is gitignored. Delete it to force a fresh token; `rnp` will
re-register transparently.
