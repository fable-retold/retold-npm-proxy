# Docker

The registry can run directly (a `verdaccio` process) or under docker compose. The two
are interchangeable: they use the same `config.yaml` and bind-mount the same
`storage/`, so they share one warehouse on disk. Pick whichever you prefer per machine.

## Start and stop under docker

```bash
rnp start --docker
rnp stop --docker
```

`start --docker` runs `docker compose up -d` in the registry folder; `stop --docker`
runs `docker compose down`. Add `--foreground` to `start --docker` to stream logs
instead of detaching.

## The compose file

The registry folder ships a `docker-compose.yml`:

```yaml
services:
  registry:
    image: verdaccio/verdaccio:5
    container_name: retold-registry
    ports:
      - "4873:4873"
    volumes:
      - ./config.yaml:/verdaccio/conf/config.yaml:ro
      - ./storage:/verdaccio/storage
    restart: unless-stopped
```

Because `./storage` is bind-mounted, the warehouse persists across container restarts and
is the same folder a direct `verdaccio` run would use. You can warehouse with the direct
tool and serve with docker, or the reverse.

## Direct vs docker

| | Direct (`rnp start`) | Docker (`rnp start --docker`) |
|---|---|---|
| Requires | `npm install` in the registry folder | docker running |
| Process | a detached `verdaccio` (pid tracked by port) | a compose service (`restart: unless-stopped`) |
| Logs | `registry/verdaccio.log` | `docker compose logs` |
| Storage | `registry/storage/` | same folder, bind-mounted |

For a laptop dev loop the direct path is lighter; for a shared or always-on box the
compose service with `restart: unless-stopped` is usually what you want.
