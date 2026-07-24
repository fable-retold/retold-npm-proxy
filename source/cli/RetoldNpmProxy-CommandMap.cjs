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

// Shared across commands.
const OPTION_REGISTRY_DIR = { Name: '--registry-dir <path>', Description: 'Path to the registry folder (default: auto-discover registry/config.yaml).', Default: undefined };
const OPTION_URL = { Name: '--url <url>', Description: 'Registry URL (default: http://localhost:4873).', Default: undefined };

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
	}
];

module.exports = CommandMap;
