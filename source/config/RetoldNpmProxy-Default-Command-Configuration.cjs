/**
 * Default program configuration, gathered by pict-service-commandlineutility
 * (AutoGatherProgramConfiguration). A user's .retold-npm-proxy.json and any --config
 * file layer on top. These are just the tool's runtime defaults; every one is also a
 * per-command flag.
 */
module.exports =
	({
		// Where the registry folder lives. Empty = auto-discover (walk up for registry/config.yaml,
		// then fall back to the copy shipped next to this monorepo).
		"RegistryDirectory": "",

		// The running registry's URL. Everything (status/warehouse/publish) talks to this.
		"RegistryURL": "http://localhost:4873",

		// The publisher account the tool registers on the local registry to get a publish token.
		// A local cache, so this is a convenience credential, not a secret.
		"PublisherUser": "retold-local",
		"PublisherPassword": "retold-local"
	});
