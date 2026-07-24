/**
 * RetoldNpmProxy-Core-Publish
 *
 * Publish a retold package into the local registry WITHOUT tripping npm's client-side
 * `private: true` guard and without mutating the package's source.
 *
 * `npm publish` refuses a package marked private -- which every retold module is, on
 * purpose (a guardrail keeps that flag so nothing ever lands on PUBLIC npm by accident).
 * So instead we do what npm does under the hood, minus that guard:
 *   1. `npm pack` the module (pack is happy to tar a private package) -- this yields the
 *      exact publishable tarball plus its shasum + integrity.
 *   2. Assemble the packument (metadata + base64 tarball attachment) and PUT it straight
 *      to Verdaccio. The registry has no private guard of its own.
 * The `private` field is dropped from the version metadata we send, so the published
 * record is clean, while the module's own package.json on disk is never touched.
 */
const libFS = require('fs');
const libOS = require('os');
const libPath = require('path');
const libChildProcess = require('child_process');

const libToken = require('./RetoldNpmProxy-Core-Token.js');

// Verdaccio accepts a scoped package as `@scope%2fname`; unscoped names pass through.
function encodePackageName(pName)
{
	return pName.startsWith('@') ? pName.replace('/', '%2f') : pName;
}

// `npm pack --json` -> the tarball path + its shasum/integrity, computed by npm itself.
function packModule(pModuleDir)
{
	let tmpTempDir = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'rnp-pack-'));
	let tmpRun = libChildProcess.spawnSync(
		'npm', [ 'pack', '--json', '--pack-destination', tmpTempDir, libPath.resolve(pModuleDir) ],
		{ encoding: 'utf8' });
	if (tmpRun.status !== 0)
	{
		throw new Error(`npm pack failed for [${pModuleDir}]: ${(tmpRun.stderr || tmpRun.stdout || '').trim()}`);
	}
	let tmpParsed = JSON.parse(tmpRun.stdout);
	let tmpInfo = Array.isArray(tmpParsed) ? tmpParsed[0] : tmpParsed;
	return {
		TarballPath: libPath.join(tmpTempDir, tmpInfo.filename),
		Filename: tmpInfo.filename,
		Shasum: tmpInfo.shasum,
		Integrity: tmpInfo.integrity,
		TempDir: tmpTempDir
	};
}

/**
 * @param {string} pModuleDir - Path to the package to publish.
 * @param {object} pOptions - { url, tag, PublisherUser, PublisherPassword }.
 * @returns {Promise<{ Name: string, Version: string, Tarball: string, Registry: string }>}
 */
async function publishModule(pModuleDir, pOptions)
{
	let tmpOptions = pOptions || {};
	let tmpURL = String(tmpOptions.url || 'http://localhost:4873').replace(/\/+$/, '');
	let tmpTag = tmpOptions.tag || 'latest';

	let tmpPackagePath = libPath.join(libPath.resolve(pModuleDir), 'package.json');
	if (!libFS.existsSync(tmpPackagePath)) { throw new Error(`no package.json at [${pModuleDir}]`); }
	let tmpPackage = JSON.parse(libFS.readFileSync(tmpPackagePath, 'utf8'));
	let tmpName = tmpPackage.name;
	let tmpVersion = tmpPackage.version;
	if (!tmpName || !tmpVersion) { throw new Error(`[${pModuleDir}] package.json needs a name and version`); }

	let tmpPack = packModule(pModuleDir);
	try
	{
		let tmpTarballBytes = libFS.readFileSync(tmpPack.TarballPath);

		// The version record is the package.json minus the publish-blocking `private` flag.
		let tmpVersionRecord = Object.assign({}, tmpPackage);
		delete tmpVersionRecord.private;
		tmpVersionRecord._id = `${tmpName}@${tmpVersion}`;
		tmpVersionRecord.dist =
			{
				shasum: tmpPack.Shasum,
				integrity: tmpPack.Integrity,
				tarball: `${tmpURL}/${tmpName}/-/${tmpPack.Filename}`
			};

		let tmpPackument =
			{
				_id: tmpName,
				name: tmpName,
				description: tmpPackage.description || '',
				'dist-tags': { [tmpTag]: tmpVersion },
				versions: { [tmpVersion]: tmpVersionRecord },
				_attachments:
					{
						[tmpPack.Filename]:
							{
								content_type: 'application/octet-stream',
								data: tmpTarballBytes.toString('base64'),
								length: tmpTarballBytes.length
							}
					}
			};

		let fPut = async (pToken) => fetch(`${tmpURL}/${encodePackageName(tmpName)}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + pToken },
				body: JSON.stringify(tmpPackument)
			});

		let tmpToken = await libToken.ensureToken(tmpURL, tmpOptions);
		let tmpResponse = await fPut(tmpToken);
		if (tmpResponse.status === 401 || tmpResponse.status === 403)
		{
			// Stale cached token -- acquire a fresh one and retry once.
			tmpToken = await libToken.ensureToken(tmpURL, Object.assign({}, tmpOptions, { force: true }));
			tmpResponse = await fPut(tmpToken);
		}
		if (!tmpResponse.ok)
		{
			let tmpText = await tmpResponse.text().catch(() => '');
			throw new Error(`registry rejected publish of ${tmpName}@${tmpVersion} (HTTP ${tmpResponse.status}): ${tmpText.slice(0, 200)}`);
		}

		return { Name: tmpName, Version: tmpVersion, Tarball: tmpPack.Filename, Registry: tmpURL };
	}
	finally
	{
		try { libFS.rmSync(tmpPack.TempDir, { recursive: true, force: true }); } catch (pError) { /* best effort */ }
	}
}

module.exports = { publishModule, encodePackageName };
