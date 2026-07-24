/**
 * RetoldNpmProxy-Core-Warehouse
 *
 * Walk every package-lock.json under a root, collect every registry tarball it
 * references, and pull each one THROUGH the proxy so Verdaccio caches it into storage.
 * After this, storage is a complete, portable, offline mirror of the dependency closure.
 *
 * Self-contained on purpose: the tool does not import the registry folder's own script,
 * so each works without the other.
 */
const libFS = require('fs');
const libPath = require('path');

function findLockfiles(pRoot)
{
	let tmpFound = [];
	let tmpStack = [ libPath.resolve(pRoot) ];
	while (tmpStack.length > 0)
	{
		let tmpDir = tmpStack.pop();
		let tmpEntries;
		try { tmpEntries = libFS.readdirSync(tmpDir, { withFileTypes: true }); }
		catch (pError) { continue; }
		for (let i = 0; i < tmpEntries.length; i++)
		{
			let tmpEntry = tmpEntries[i];
			if (tmpEntry.isDirectory())
			{
				if (tmpEntry.name === 'node_modules' || tmpEntry.name === '.git' || tmpEntry.name === 'storage') { continue; }
				tmpStack.push(libPath.join(tmpDir, tmpEntry.name));
			}
			else if (tmpEntry.name === 'package-lock.json')
			{
				tmpFound.push(libPath.join(tmpDir, tmpEntry.name));
			}
		}
	}
	return tmpFound;
}

function collectTarballs(pLockPath, pSet)
{
	let tmpLock;
	try { tmpLock = JSON.parse(libFS.readFileSync(pLockPath, 'utf8')); }
	catch (pError) { return; }

	let fConsider = (pResolved) =>
	{
		if (typeof pResolved !== 'string') { return; }
		if (!/^https?:\/\/registry\.npmjs\.org\//.test(pResolved)) { return; }
		if (!pResolved.endsWith('.tgz')) { return; }
		pSet.add(pResolved);
	};

	if (tmpLock.packages && typeof tmpLock.packages === 'object')
	{
		for (let tmpKey of Object.keys(tmpLock.packages))
		{
			fConsider(tmpLock.packages[tmpKey] && tmpLock.packages[tmpKey].resolved);
		}
	}
	let fWalkV1 = (pDeps) =>
	{
		if (!pDeps || typeof pDeps !== 'object') { return; }
		for (let tmpName of Object.keys(pDeps))
		{
			fConsider(pDeps[tmpName].resolved);
			fWalkV1(pDeps[tmpName].dependencies);
		}
	};
	fWalkV1(tmpLock.dependencies);
}

async function warehouseOne(pRegistryURL, pResolved)
{
	let tmpURL = pRegistryURL + new URL(pResolved).pathname;
	try
	{
		let tmpResponse = await fetch(tmpURL, { method: 'GET' });
		await tmpResponse.arrayBuffer();
		return tmpResponse.ok;
	}
	catch (pError) { return false; }
}

/**
 * @param {object} pOptions - { registryURL, root, concurrency, onProgress? }.
 * @returns {Promise<{ Lockfiles: number, Unique: number, OK: number, Fail: number, Failed: string[] }>}
 */
async function warehouse(pOptions)
{
	let tmpOptions = pOptions || {};
	let tmpRegistryURL = String(tmpOptions.registryURL || 'http://localhost:4873').replace(/\/+$/, '');
	let tmpRoot = tmpOptions.root || process.cwd();
	let tmpConcurrency = Math.max(1, parseInt(tmpOptions.concurrency || 8, 10));
	let fProgress = (typeof tmpOptions.onProgress === 'function') ? tmpOptions.onProgress : () => {};

	let tmpLocks = findLockfiles(tmpRoot);
	let tmpSet = new Set();
	for (let tmpLock of tmpLocks) { collectTarballs(tmpLock, tmpSet); }
	let tmpTarballs = [ ...tmpSet ];

	let tmpOK = 0;
	let tmpFail = 0;
	let tmpIndex = 0;
	let tmpFailed = [];
	async function worker()
	{
		while (tmpIndex < tmpTarballs.length)
		{
			let tmpResolved = tmpTarballs[tmpIndex++];
			let tmpGood = await warehouseOne(tmpRegistryURL, tmpResolved);
			if (tmpGood) { tmpOK++; } else { tmpFail++; tmpFailed.push(tmpResolved); }
			fProgress({ Done: tmpOK + tmpFail, Total: tmpTarballs.length, OK: tmpOK, Fail: tmpFail });
		}
	}
	await Promise.all(Array.from({ length: tmpConcurrency }, () => worker()));

	return { Lockfiles: tmpLocks.length, Unique: tmpTarballs.length, OK: tmpOK, Fail: tmpFail, Failed: tmpFailed };
}

module.exports = { warehouse, findLockfiles, collectTarballs };
