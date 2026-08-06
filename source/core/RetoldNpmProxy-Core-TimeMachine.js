/**
 * RetoldNpmProxy-Core-TimeMachine
 *
 * "Time machine" the monorepo: pull EVERY published version of every package referenced in any
 * package.json (dependencies / devDependencies / peerDependencies / optionalDependencies) through
 * the proxy, so Verdaccio caches the full version history -- not just the single version a lockfile
 * pins right now (that is `warehouse`). After this, an old checkout whose package.json ranges
 * resolve to older versions installs straight from the proxy.
 *
 * It reads each package's packument through the proxy (which lists every version + its tarball),
 * then GETs each tarball through the proxy (a plain GET that records WHY any version fails) so it
 * lands in storage. Only DIRECT references are expanded (the names in package.json); a version's
 * own transitive deps are pulled on demand the first time something actually installs it.
 */
const libFS = require('fs');
const libPath = require('path');
const libChildProcess = require('child_process');

const _SECTIONS = [ 'dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies' ];

// Walk for package.json files, skipping node_modules / .git / storage.
function findPackageJsons(pRoot)
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
			else if (tmpEntry.name === 'package.json')
			{
				tmpFound.push(libPath.join(tmpDir, tmpEntry.name));
			}
		}
	}
	return tmpFound;
}

// Every unique dependency NAME referenced across every package.json under pRoot (all four sections).
function collectPackageNames(pRoot)
{
	let tmpNames = new Set();
	for (let tmpFile of findPackageJsons(pRoot))
	{
		let tmpJson;
		try { tmpJson = JSON.parse(libFS.readFileSync(tmpFile, 'utf8')); }
		catch (pError) { continue; }
		for (let tmpSection of _SECTIONS)
		{
			if (!tmpJson[tmpSection] || typeof tmpJson[tmpSection] !== 'object') { continue; }
			for (let tmpName of Object.keys(tmpJson[tmpSection])) { tmpNames.add(tmpName); }
		}
	}
	return [ ...tmpNames ].sort();
}

// Every directory under pRoot that is a git repository (has a .git). Nested repos are all
// included (each retold module is its own clone); node_modules / .git / storage are skipped.
function findGitRepos(pRoot)
{
	let tmpFound = [];
	let tmpStack = [ libPath.resolve(pRoot) ];
	while (tmpStack.length > 0)
	{
		let tmpDir = tmpStack.pop();
		let tmpEntries;
		try { tmpEntries = libFS.readdirSync(tmpDir, { withFileTypes: true }); }
		catch (pError) { continue; }
		if (tmpEntries.some((pEntry) => pEntry.name === '.git')) { tmpFound.push(tmpDir); }
		for (let i = 0; i < tmpEntries.length; i++)
		{
			let tmpEntry = tmpEntries[i];
			if (!tmpEntry.isDirectory()) { continue; }
			if (tmpEntry.name === 'node_modules' || tmpEntry.name === '.git' || tmpEntry.name === 'storage') { continue; }
			tmpStack.push(libPath.join(tmpDir, tmpEntry.name));
		}
	}
	return tmpFound;
}

// Union into pNames every dependency name from EVERY package.json blob in one repo's full history
// (all refs, all paths -- including nested example-app package.json), so a dep that only an old
// commit referenced (later removed or renamed) is still captured. Uses `rev-list --all --objects`
// to enumerate package.json blobs, then one batched `cat-file` to read them.
function _harvestRepoHistory(pRepo, pNames)
{
	let tmpObjects;
	try { tmpObjects = libChildProcess.execSync('git rev-list --all --objects', { cwd: pRepo, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 }); }
	catch (pError) { return; }   // no history / not a repo

	let tmpShas = new Set();
	for (let tmpLine of tmpObjects.split('\n'))
	{
		let tmpSpace = tmpLine.indexOf(' ');
		if (tmpSpace < 0) { continue; }
		if (/(^|\/)package\.json$/.test(tmpLine.slice(tmpSpace + 1))) { tmpShas.add(tmpLine.slice(0, tmpSpace)); }
	}
	if (tmpShas.size < 1) { return; }

	let tmpRun = libChildProcess.spawnSync('git', [ 'cat-file', '--batch' ],
		{ cwd: pRepo, input: [ ...tmpShas ].join('\n') + '\n', maxBuffer: 1024 * 1024 * 512 });
	if (tmpRun.status !== 0 || !tmpRun.stdout) { return; }

	// Batch output is a stream of "<sha> blob <size>\n<size bytes>\n" records (or "<sha> missing\n").
	let tmpBuffer = tmpRun.stdout;
	let tmpPos = 0;
	while (tmpPos < tmpBuffer.length)
	{
		let tmpNewline = tmpBuffer.indexOf(0x0a, tmpPos);
		if (tmpNewline < 0) { break; }
		let tmpParts = tmpBuffer.toString('utf8', tmpPos, tmpNewline).split(' ');
		tmpPos = tmpNewline + 1;
		if (tmpParts.length < 3) { continue; }   // "<sha> missing" -- no content follows
		let tmpSize = parseInt(tmpParts[2], 10);
		if (!(tmpSize >= 0)) { continue; }
		let tmpContent = tmpBuffer.toString('utf8', tmpPos, tmpPos + tmpSize);
		tmpPos += tmpSize + 1;   // content + trailing newline
		let tmpJson;
		try { tmpJson = JSON.parse(tmpContent); }
		catch (pError) { continue; }
		for (let tmpSection of _SECTIONS)
		{
			if (!tmpJson[tmpSection] || typeof tmpJson[tmpSection] !== 'object') { continue; }
			for (let tmpName of Object.keys(tmpJson[tmpSection])) { pNames.add(tmpName); }
		}
	}
}

// Union into pNames every dependency name that appears in any package.json anywhere in the git
// history of any repo under pRoot.
function collectPackageNamesFromGitHistory(pRoot, pNames, pOnRepo)
{
	let tmpRepos = findGitRepos(pRoot);
	let fOnRepo = (typeof pOnRepo === 'function') ? pOnRepo : () => {};
	for (let i = 0; i < tmpRepos.length; i++)
	{
		_harvestRepoHistory(tmpRepos[i], pNames);
		fOnRepo({ Done: i + 1, Total: tmpRepos.length, Repo: tmpRepos[i] });
	}
	return pNames;
}

// Pure: every version's tarball URL from a packument, optionally skipping prereleases.
function tarballsFromPackument(pPackument, pOptions)
{
	let tmpOptions = pOptions || {};
	let tmpVersions = (pPackument && pPackument.versions && typeof pPackument.versions === 'object') ? pPackument.versions : {};
	let tmpTarballs = [];
	for (let tmpVersion of Object.keys(tmpVersions))
	{
		if (tmpOptions.stableOnly && tmpVersion.indexOf('-') >= 0) { continue; }   // 1.0.0-beta.1, -rc.2, etc.
		let tmpDist = tmpVersions[tmpVersion] && tmpVersions[tmpVersion].dist;
		let tmpTarball = tmpDist && tmpDist.tarball;
		if (typeof tmpTarball === 'string' && tmpTarball.endsWith('.tgz')) { tmpTarballs.push(tmpTarball); }
	}
	return tmpTarballs;
}

// Fetch a package's packument through the proxy and return its tarball URLs.
async function packumentTarballs(pRegistryURL, pName, pOptions)
{
	let tmpURL = pRegistryURL + '/' + pName.replace(/\//g, '%2f');   // @scope/name -> @scope%2fname
	try
	{
		let tmpResponse = await fetch(tmpURL, { method: 'GET' });
		if (!tmpResponse.ok) { return { Name: pName, Tarballs: [], Error: 'HTTP ' + tmpResponse.status }; }
		let tmpJson = await tmpResponse.json();
		return { Name: pName, Tarballs: tarballsFromPackument(tmpJson, pOptions) };
	}
	catch (pError) { return { Name: pName, Tarballs: [], Error: pError.message }; }
}

// Pull one tarball through the proxy, returning WHY it failed (so the run can report which versions
// 404'd or errored -- almost always a version whose tarball npm has since removed/unpublished).
async function _fetchTarball(pRegistryURL, pTarball)
{
	let tmpURL = pRegistryURL + new URL(pTarball).pathname;
	try
	{
		let tmpResponse = await fetch(tmpURL, { method: 'GET' });
		await tmpResponse.arrayBuffer();
		return tmpResponse.ok ? { OK: true } : { OK: false, Reason: 'HTTP ' + tmpResponse.status };
	}
	catch (pError) { return { OK: false, Reason: (pError && pError.message) || 'fetch error' }; }
}

async function _runWorkers(pCount, pWorker)
{
	await Promise.all(Array.from({ length: pCount }, () => pWorker()));
}

/**
 * @param {object} pOptions - { registryURL, root, concurrency, stableOnly, planOnly, resumeFile, onPackument, onProgress }
 * @returns {Promise<{Packages,Versions,OK,Fail,Skip,Failed,NoMetadata,Planned?}>}
 */
async function timemachine(pOptions)
{
	let tmpOptions = pOptions || {};
	let tmpRegistryURL = String(tmpOptions.registryURL || 'http://localhost:4873').replace(/\/+$/, '');
	let tmpRoot = tmpOptions.root || process.cwd();
	let tmpConcurrency = Math.max(1, parseInt(tmpOptions.concurrency || 8, 10));
	let tmpStableOnly = !!tmpOptions.stableOnly;
	let fPackument = (typeof tmpOptions.onPackument === 'function') ? tmpOptions.onPackument : () => {};
	let fProgress = (typeof tmpOptions.onProgress === 'function') ? tmpOptions.onProgress : () => {};
	let fFailure = (typeof tmpOptions.onFailure === 'function') ? tmpOptions.onFailure : () => {};

	// 1. Every referenced package name -- from the current tree, plus (optionally) every name that
	//    ever appeared in any package.json across git history, so removed/renamed deps count too.
	let tmpNames = collectPackageNames(tmpRoot);
	let tmpHistoryAdded = 0;
	if (tmpOptions.gitHistory)
	{
		let tmpNameSet = new Set(tmpNames);
		let tmpBefore = tmpNameSet.size;
		collectPackageNamesFromGitHistory(tmpRoot, tmpNameSet, tmpOptions.onRepo);
		tmpHistoryAdded = tmpNameSet.size - tmpBefore;
		tmpNames = [ ...tmpNameSet ].sort();
	}

	// 2. Read each packument (bounded) and collect every version's tarball URL.
	let tmpTarballSet = new Set();
	let tmpNoMetadata = [];
	{
		let tmpIndex = 0;
		let tmpDone = 0;
		await _runWorkers(tmpConcurrency, async () =>
		{
			while (tmpIndex < tmpNames.length)
			{
				let tmpName = tmpNames[tmpIndex++];
				let tmpResult = await packumentTarballs(tmpRegistryURL, tmpName, { stableOnly: tmpStableOnly });
				if (tmpResult.Error) { tmpNoMetadata.push(tmpName); }
				for (let tmpTarball of tmpResult.Tarballs) { tmpTarballSet.add(tmpTarball); }
				fPackument({ Done: ++tmpDone, Total: tmpNames.length, Package: tmpName, Versions: tmpResult.Tarballs.length });
			}
		});
	}
	let tmpTarballs = [ ...tmpTarballSet ];

	if (tmpOptions.planOnly)
	{
		return { Packages: tmpNames.length, HistoryAdded: tmpHistoryAdded, Versions: tmpTarballs.length, OK: 0, Fail: 0, Skip: 0, Failed: [], NoMetadata: tmpNoMetadata, Planned: true };
	}

	// 3. Resume support: skip tarball pathnames already recorded done; append as we go so a
	//    re-run after an interruption does not re-download tens of GB.
	let tmpDoneSet = new Set();
	let tmpResumeStream = null;
	let tmpFailStream = null;
	if (tmpOptions.resumeFile)
	{
		try { String(libFS.readFileSync(tmpOptions.resumeFile, 'utf8')).split('\n').forEach((pLine) => { let tmpTrim = pLine.trim(); if (tmpTrim) { tmpDoneSet.add(tmpTrim); } }); }
		catch (pError) { /* first run: no file yet */ }
		tmpResumeStream = libFS.createWriteStream(tmpOptions.resumeFile, { flags: 'a' });
		// Fresh failure log per run, next to the progress file, so an unattended run leaves a record.
		tmpFailStream = libFS.createWriteStream(tmpOptions.resumeFile + '.failures', { flags: 'w' });
	}

	// 4. Pull each tarball through the proxy.
	let tmpOK = 0, tmpFail = 0, tmpSkip = 0, tmpIndex = 0;
	let tmpFailed = [];
	await _runWorkers(tmpConcurrency, async () =>
	{
		while (tmpIndex < tmpTarballs.length)
		{
			let tmpTarball = tmpTarballs[tmpIndex++];
			let tmpPathname;
			try { tmpPathname = new URL(tmpTarball).pathname; } catch (pError) { tmpPathname = tmpTarball; }
			if (tmpDoneSet.has(tmpPathname)) { tmpSkip++; fProgress({ Done: tmpOK + tmpFail + tmpSkip, Total: tmpTarballs.length, OK: tmpOK, Fail: tmpFail, Skip: tmpSkip }); continue; }
			let tmpFetch = await _fetchTarball(tmpRegistryURL, tmpTarball);
			if (tmpFetch.OK) { tmpOK++; if (tmpResumeStream) { tmpResumeStream.write(tmpPathname + '\n'); } }
			else
			{
				tmpFail++;
				tmpFailed.push({ URL: tmpTarball, Reason: tmpFetch.Reason });
				if (tmpFailStream) { tmpFailStream.write(tmpFetch.Reason + '  ' + tmpTarball + '\n'); }
				fFailure({ URL: tmpTarball, Reason: tmpFetch.Reason });
			}
			fProgress({ Done: tmpOK + tmpFail + tmpSkip, Total: tmpTarballs.length, OK: tmpOK, Fail: tmpFail, Skip: tmpSkip });
		}
	});
	if (tmpResumeStream) { tmpResumeStream.end(); }
	if (tmpFailStream) { tmpFailStream.end(); }

	return { Packages: tmpNames.length, HistoryAdded: tmpHistoryAdded, Versions: tmpTarballs.length, OK: tmpOK, Fail: tmpFail, Skip: tmpSkip, Failed: tmpFailed, NoMetadata: tmpNoMetadata };
}

module.exports = { timemachine, collectPackageNames, collectPackageNamesFromGitHistory, findGitRepos, tarballsFromPackument, packumentTarballs, findPackageJsons };
