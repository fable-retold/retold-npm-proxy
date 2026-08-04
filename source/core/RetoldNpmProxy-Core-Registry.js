/**
 * RetoldNpmProxy-Core-Registry
 *
 * Locate the registry folder, know its URL, and start/stop/status it. The tool never
 * imports the registry -- it drives the registry folder's own verdaccio/docker and
 * talks to the running server over HTTP, so the two stay decoupled.
 */
const libFS = require('fs');
const libPath = require('path');
const libChildProcess = require('child_process');

const _DEFAULT_URL = 'http://localhost:4873';

// Walk up from a directory looking for one that contains `registry/config.yaml`.
function findRegistryUpward(pStartDir)
{
	let tmpDir = libPath.resolve(pStartDir);
	while (true)
	{
		let tmpCandidate = libPath.join(tmpDir, 'registry', 'config.yaml');
		if (libFS.existsSync(tmpCandidate)) { return libPath.join(tmpDir, 'registry'); }
		let tmpParent = libPath.dirname(tmpDir);
		if (tmpParent === tmpDir) { return null; }
		tmpDir = tmpParent;
	}
}

// Walk up from a start dir reading the first `.retold-npm-proxy.json` found. The framework
// gathers this file too (for the `configure` explanation command), but resolving URL/dir here
// as well is what makes a project's RegistryURL/RegistryDirectory actually take effect in every
// command (status/warehouse/publish/use/where), not only when passed as a --flag.
function gatheredConfig(pStartDir)
{
	let tmpDir = libPath.resolve(pStartDir || process.cwd());
	while (true)
	{
		let tmpCandidate = libPath.join(tmpDir, '.retold-npm-proxy.json');
		if (libFS.existsSync(tmpCandidate))
		{
			try { return JSON.parse(libFS.readFileSync(tmpCandidate, 'utf8')) || {}; }
			catch (pError) { return {}; }
		}
		let tmpParent = libPath.dirname(tmpDir);
		if (tmpParent === tmpDir) { return {}; }
		tmpDir = tmpParent;
	}
}

/**
 * Resolve the registry directory. Priority: explicit option -> env RETOLD_REGISTRY_DIR ->
 * config-file RegistryDirectory -> walk up from cwd -> the copy shipped next to this monorepo.
 * @param {object} pOptions
 * @returns {string}
 */
function resolveRegistryDir(pOptions)
{
	let tmpOptions = pOptions || {};
	let tmpExplicit = tmpOptions.registryDir || tmpOptions.RegistryDirectory || process.env.RETOLD_REGISTRY_DIR || gatheredConfig(process.cwd()).RegistryDirectory || '';
	if (tmpExplicit) { return libPath.resolve(tmpExplicit); }

	let tmpFound = findRegistryUpward(process.cwd());
	if (tmpFound) { return tmpFound; }

	// This file lives at retold/modules/apps/retold-npm-proxy/source/core, so the
	// sibling registry is five levels up.
	return libPath.resolve(__dirname, '..', '..', '..', '..', '..', 'registry');
}

function registryURL(pOptions)
{
	let tmpOptions = pOptions || {};
	return String(tmpOptions.url || tmpOptions.RegistryURL || gatheredConfig(process.cwd()).RegistryURL || _DEFAULT_URL).replace(/\/+$/, '');
}

// The monorepo root is the directory that holds the registry folder.
function monorepoRoot(pOptions)
{
	return libPath.dirname(resolveRegistryDir(pOptions));
}

async function ping(pURL)
{
	try
	{
		let tmpResponse = await fetch(pURL + '/-/ping', { method: 'GET' });
		return tmpResponse.ok;
	}
	catch (pError)
	{
		return false;
	}
}

// Count packages and tarballs in the warehouse without walking the world.
function storageStats(pRegistryDir)
{
	let tmpStorage = libPath.join(pRegistryDir, 'storage');
	let tmpResult = { StoragePath: tmpStorage, Packages: 0, Tarballs: 0, Bytes: 0, Exists: false };
	if (!libFS.existsSync(tmpStorage)) { return tmpResult; }
	tmpResult.Exists = true;

	let tmpStack = [ tmpStorage ];
	let tmpPackageDirs = new Set();
	while (tmpStack.length > 0)
	{
		let tmpDir = tmpStack.pop();
		let tmpEntries;
		try { tmpEntries = libFS.readdirSync(tmpDir, { withFileTypes: true }); }
		catch (pError) { continue; }
		for (let i = 0; i < tmpEntries.length; i++)
		{
			let tmpEntry = tmpEntries[i];
			let tmpFull = libPath.join(tmpDir, tmpEntry.name);
			if (tmpEntry.isDirectory()) { tmpStack.push(tmpFull); }
			else if (tmpEntry.name.endsWith('.tgz'))
			{
				tmpResult.Tarballs++;
				tmpPackageDirs.add(tmpDir);
				try { tmpResult.Bytes += libFS.statSync(tmpFull).size; } catch (pError) { /* ignore */ }
			}
		}
	}
	tmpResult.Packages = tmpPackageDirs.size;
	return tmpResult;
}

// The verdaccio binary inside the registry folder (installed via `npm install` there).
function verdaccioBinary(pRegistryDir)
{
	let tmpBin = libPath.join(pRegistryDir, 'node_modules', '.bin', 'verdaccio');
	return libFS.existsSync(tmpBin) ? tmpBin : null;
}

/**
 * Start the registry. Docker or direct; detached by default.
 * @returns {{ Mode: string, Detached: boolean, PID?: number, Message: string }}
 */
function start(pOptions)
{
	let tmpOptions = pOptions || {};
	let tmpRegistryDir = resolveRegistryDir(tmpOptions);
	if (!libFS.existsSync(tmpRegistryDir)) { throw new Error(`Registry folder not found at [${tmpRegistryDir}]. Pass --registry-dir <path>.`); }
	let tmpForeground = !!tmpOptions.foreground;

	if (tmpOptions.docker)
	{
		let tmpArgs = tmpForeground ? [ 'compose', 'up' ] : [ 'compose', 'up', '-d' ];
		let tmpRun = libChildProcess.spawnSync('docker', tmpArgs, { cwd: tmpRegistryDir, stdio: 'inherit' });
		if (tmpRun.error) { throw new Error(`docker compose failed to launch: ${tmpRun.error.message}`); }
		return { Mode: 'docker', Detached: !tmpForeground, Message: 'docker compose is up' };
	}

	let tmpBin = verdaccioBinary(tmpRegistryDir);
	if (!tmpBin) { throw new Error(`verdaccio is not installed in [${tmpRegistryDir}]. Run \`npm install\` there first (or use --docker).`); }
	let tmpPort = String(tmpOptions.port || 4873);
	let tmpArgs = [ '--config', './config.yaml', '--listen', tmpPort ];

	if (tmpForeground)
	{
		let tmpRun = libChildProcess.spawnSync(tmpBin, tmpArgs, { cwd: tmpRegistryDir, stdio: 'inherit' });
		return { Mode: 'direct', Detached: false, Message: `verdaccio exited (${tmpRun.status})` };
	}

	// Detached: log to the registry folder (gitignored) and let it outlive this process.
	let tmpLogPath = libPath.join(tmpRegistryDir, 'verdaccio.log');
	let tmpLogFD = libFS.openSync(tmpLogPath, 'a');
	let tmpChild = libChildProcess.spawn(tmpBin, tmpArgs,
		{ cwd: tmpRegistryDir, detached: true, stdio: [ 'ignore', tmpLogFD, tmpLogFD ] });
	tmpChild.unref();
	return { Mode: 'direct', Detached: true, PID: tmpChild.pid, Message: `verdaccio started (pid ${tmpChild.pid}); log at ${tmpLogPath}` };
}

/**
 * Stop the registry. Docker compose down, or kill whatever holds the port.
 * @returns {{ Mode: string, Stopped: boolean, Message: string }}
 */
function stop(pOptions)
{
	let tmpOptions = pOptions || {};
	let tmpRegistryDir = resolveRegistryDir(tmpOptions);

	if (tmpOptions.docker)
	{
		let tmpRun = libChildProcess.spawnSync('docker', [ 'compose', 'down' ], { cwd: tmpRegistryDir, stdio: 'inherit' });
		if (tmpRun.error) { throw new Error(`docker compose down failed: ${tmpRun.error.message}`); }
		return { Mode: 'docker', Stopped: true, Message: 'docker compose is down' };
	}

	// Direct: free the port by killing its listener (works regardless of who started it).
	let tmpPort = String(tmpOptions.port || 4873);
	let tmpLookup = libChildProcess.spawnSync('lsof', [ '-ti', `:${tmpPort}` ], { encoding: 'utf8' });
	let tmpPIDs = String(tmpLookup.stdout || '').split(/\s+/).map((pV) => parseInt(pV, 10)).filter((pV) => pV > 0);
	if (tmpPIDs.length < 1) { return { Mode: 'direct', Stopped: false, Message: `nothing is listening on :${tmpPort}` }; }
	for (let i = 0; i < tmpPIDs.length; i++)
	{
		try { process.kill(tmpPIDs[i], 'SIGTERM'); } catch (pError) { /* already gone */ }
	}
	return { Mode: 'direct', Stopped: true, Message: `stopped pid(s) ${tmpPIDs.join(', ')} on :${tmpPort}` };
}

module.exports = { resolveRegistryDir, registryURL, gatheredConfig, monorepoRoot, ping, storageStats, verdaccioBinary, start, stop };
