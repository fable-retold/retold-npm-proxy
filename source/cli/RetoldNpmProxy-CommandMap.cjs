/**
 * RetoldNpmProxy-CommandMap
 *
 * The single declarative source of truth for every action the tool performs. One entry per command;
 * the CommandFactory turns each into a pict-service-commandlineutility command class. Adding a
 * command = one handler + one entry here.
 *
 * The tool is decoupled from the registry: it drives the registry FOLDER's own `npm start` /
 * `docker compose` and talks to the running Verdaccio over HTTP. The registry runs fine without this
 * tool; this tool is a convenience control surface over it.
 */
const libHandlerStart = require('./handlers/RetoldNpmProxy-Handler-Start.js');
const libHandlerStop = require('./handlers/RetoldNpmProxy-Handler-Stop.js');
const libHandlerStatus = require('./handlers/RetoldNpmProxy-Handler-Status.js');
const libHandlerWarehouse = require('./handlers/RetoldNpmProxy-Handler-Warehouse.js');
const libHandlerPublish = require('./handlers/RetoldNpmProxy-Handler-Publish.js');
const libHandlerUse = require('./handlers/RetoldNpmProxy-Handler-Use.js');
const libHandlerWhere = require('./handlers/RetoldNpmProxy-Handler-Where.js');
const libHandlerTimeMachine = require('./handlers/RetoldNpmProxy-Handler-TimeMachine.js');

// Shared across commands.
const OPTION_REGISTRY_DIR = { Name: '--registry-dir <path>', Description: 'Path to the registry folder (default: auto-discover registry/config.yaml).', Default: undefined };
const OPTION_URL = { Name: '--url <url>', Description: 'Registry URL (default: http://localhost:4873).', Default: undefined };
const OPTION_GLOBAL = { Name: '--global', Description: 'Write to ~/.npmrc and ~/.retold-npm-proxy.json instead of the monorepo root.' };

const CommandMap =
[
	{
		Keyword: 'status',
		Description: 'Is the registry up? Report its URL, health, and warehouse size.',
		Transport: 'native',
		Options: [ OPTION_URL, OPTION_REGISTRY_DIR ],
		Handler: libHandlerStatus
	},
	{
		Keyword: 'start',
		Description: 'Start the registry. Direct (verdaccio) by default, or `--docker` for docker compose.',
		Transport: 'native',
		Options:
		[
			OPTION_REGISTRY_DIR,
			OPTION_URL,
			{ Name: '--docker', Description: 'Start via docker compose instead of running verdaccio directly.' },
			{ Name: '--foreground', Description: 'Run in the foreground (block until Ctrl-C) instead of detaching.' },
			{ Name: '--port <n>', Description: 'Port for a direct start (default 4873).' }
		],
		Handler: libHandlerStart
	},
	{
		Keyword: 'stop',
		Description: 'Stop the registry (docker compose down, or kill the process on the port).',
		Transport: 'native',
		Options:
		[
			OPTION_REGISTRY_DIR,
			{ Name: '--docker', Description: 'Stop a docker-compose registry.' },
			{ Name: '--port <n>', Description: 'Port to free for a direct start (default 4873).' }
		],
		Handler: libHandlerStop
	},
	{
		Keyword: 'warehouse',
		Description: 'Mirror every tarball the monorepo references into the registry storage (a complete, portable, offline cache).',
		Transport: 'native',
		Options:
		[
			OPTION_URL,
			{ Name: '--root <path>', Description: 'Root to scan for lockfiles (default: the monorepo root).' },
			{ Name: '--concurrency <n>', Description: 'Parallel fetches (default 8).' }
		],
		Handler: libHandlerWarehouse
	},
	{
		Keyword: 'publish',
		Description: 'Publish a private retold package into the local registry: rnp publish <module-dir>. Uses a direct tarball PUT so package.json private:true stays intact.',
		Transport: 'native',
		Options:
		[
			OPTION_URL,
			{ Name: '--tag <tag>', Description: 'dist-tag to publish under (default: latest).' }
		],
		Handler: libHandlerPublish
	},
	{
		Keyword: 'use',
		Description: 'Point npm and this tool at a registry: rnp use <url> | local | off. Rewrites the .npmrc registry line and .retold-npm-proxy.json RegistryURL together.',
		Transport: 'native',
		Options: [ OPTION_GLOBAL, OPTION_REGISTRY_DIR ],
		Handler: libHandlerUse
	},
	{
		Keyword: 'where',
		Description: 'Show where npm and this tool currently point: the .npmrc registry line, the rnp RegistryURL, the effective npm registry, and whether it answers.',
		Transport: 'native',
		Options: [ OPTION_REGISTRY_DIR ],
		Handler: libHandlerWhere
	},
	{
		Keyword: 'timemachine',
		Description: 'Mirror EVERY published version of every package referenced in the monorepo package.json files (not just lockfile-pinned), so old checkouts install from the proxy. Big -- run with --plan first to preview the scope.',
		Transport: 'native',
		Options:
		[
			OPTION_URL,
			OPTION_REGISTRY_DIR,
			{ Name: '--plan', Description: 'Count packages and versions without fetching (preview the scope).' },
			{ Name: '--stable-only', Description: 'Skip prerelease versions (alpha/beta/rc).' },
			{ Name: '--git-history', Description: 'Also harvest dependency names from every package.json across git history (incl. example apps) -- catches removed/renamed deps. Bigger.' },
			{ Name: '--root <path>', Description: 'Root to scan for package.json (default: the monorepo root).' },
			{ Name: '--concurrency <n>', Description: 'Parallel fetches (default 8).' },
			{ Name: '--resume <path>', Description: 'Progress file to skip already-cached tarballs (default: <root>/.rnp-timemachine-progress).' }
		],
		Handler: libHandlerTimeMachine
	}
];

module.exports = CommandMap;
