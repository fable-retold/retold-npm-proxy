/**
 * RetoldNpmProxy-Core-Environment
 *
 * Point npm and this tool at a registry (or off) by rewriting two files together:
 *   - the `.npmrc` `registry=` line   (what npm installs and publishes against), and
 *   - `.retold-npm-proxy.json` `RegistryURL`  (what rnp status/warehouse/publish talk to).
 * `rnp use` writes them; `rnp where` reads them. All the file logic lives here so the
 * handlers stay thin and the transforms are unit-testable.
 */
const libFS = require('fs');
const libOS = require('os');
const libPath = require('path');
const libChildProcess = require('child_process');

const libRegistry = require('./RetoldNpmProxy-Core-Registry.js');

const _LOCAL_URL = 'http://localhost:4873';
const _NPMRC = '.npmrc';
const _CONFIG = '.retold-npm-proxy.json';

/**
 * Turn a `use` target token into a resolved intent.
 *   local             -> the local registry (http://localhost:4873)
 *   off | public | none -> no registry line (npm falls back to public npm)
 *   http(s)://host...  -> that URL verbatim (trailing slash trimmed)
 *   host | host:port   -> assumed http://host[:4873]
 * @param {string} pToken
 * @returns {{ Off: boolean, URL: string }}
 */
function normalizeTarget(pToken)
{
	let tmpToken = String(pToken || '').trim();
	if (!tmpToken) { throw new Error('A target is required: a URL, `local`, or `off`.'); }

	let tmpLower = tmpToken.toLowerCase();
	if (tmpLower === 'off' || tmpLower === 'public' || tmpLower === 'none') { return { Off: true, URL: '' }; }
	if (tmpLower === 'local') { return { Off: false, URL: _LOCAL_URL }; }

	let tmpText = (/^https?:\/\//i.test(tmpToken)) ? tmpToken : ('http://' + tmpToken);
	let tmpURL;
	try { tmpURL = new URL(tmpText); }
	catch (pError) { throw new Error(`[${pToken}] is not a valid registry target (a URL, \`local\`, or \`off\`).`); }
	// Bare host with no port on plain http -> default to the verdaccio port.
	if (!tmpURL.port && tmpURL.protocol === 'http:') { tmpURL.port = '4873'; }
	return { Off: false, URL: tmpURL.toString().replace(/\/+$/, '') };
}

/**
 * Rewrite an `.npmrc`'s `registry=` line within the file's text, preserving every other line
 * (and its position). Off removes the line; a URL sets `registry=<url>/` (npm wants the slash).
 * @param {string} pContent - existing file text ('' if none)
 * @param {{ Off: boolean, URL: string }} pTarget
 * @returns {string} the new file text
 */
function rewriteNpmrc(pContent, pTarget)
{
	let tmpIsRegistry = (pLine) => (/^\s*registry\s*=/.test(pLine));
	let tmpNewLine = pTarget.Off ? null : ('registry=' + pTarget.URL + '/');

	let tmpLines = String(pContent || '').split('\n');
	// Drop trailing blank lines first (a file's final newline splits to a trailing ''), so an
	// appended registry line lands right after the real content instead of behind a stray blank.
	while (tmpLines.length > 0 && tmpLines[tmpLines.length - 1].trim() === '') { tmpLines.pop(); }

	let tmpFound = false;
	let tmpOut = [];
	for (let i = 0; i < tmpLines.length; i++)
	{
		if (tmpIsRegistry(tmpLines[i]))
		{
			// Replace the first registry line in place; drop any duplicates.
			if (!tmpFound && tmpNewLine !== null) { tmpOut.push(tmpNewLine); }
			tmpFound = true;
			continue;
		}
		tmpOut.push(tmpLines[i]);
	}
	if (!tmpFound && tmpNewLine !== null) { tmpOut.push(tmpNewLine); }

	if (tmpOut.length < 1) { return ''; }
	return tmpOut.join('\n') + '\n';
}

/**
 * Set or clear `RegistryURL` on a parsed `.retold-npm-proxy.json` object, leaving every other
 * key (PublisherUser, RegistryDirectory, ...) untouched.
 * @param {object} pConfig
 * @param {{ Off: boolean, URL: string }} pTarget
 * @returns {object} a new config object
 */
function rewriteConfig(pConfig, pTarget)
{
	let tmpConfig = Object.assign({}, pConfig || {});
	if (pTarget.Off) { delete tmpConfig.RegistryURL; }
	else { tmpConfig.RegistryURL = pTarget.URL; }
	return tmpConfig;
}

function readText(pPath)
{
	try { return libFS.readFileSync(pPath, 'utf8'); }
	catch (pError) { return ''; }
}

function readJSON(pPath)
{
	try { return JSON.parse(libFS.readFileSync(pPath, 'utf8')) || {}; }
	catch (pError) { return {}; }
}

/**
 * Where the two files live: the monorepo root by default, or the user's home with --global.
 * @param {object} pOptions - handler options (may carry .global)
 * @returns {string}
 */
function targetDirectory(pOptions)
{
	let tmpOptions = pOptions || {};
	if (tmpOptions.global || tmpOptions.Global) { return libOS.homedir(); }
	return libRegistry.monorepoRoot(tmpOptions);
}

/**
 * Read the current pointing from a directory's two files (no writes).
 * @param {string} pDirectory
 * @returns {{ NpmrcPath, NpmrcRegistry, ConfigPath, ConfigURL }}
 */
function readState(pDirectory)
{
	let tmpNpmrcPath = libPath.join(pDirectory, _NPMRC);
	let tmpConfigPath = libPath.join(pDirectory, _CONFIG);

	let tmpRegistry = '';
	let tmpLines = readText(tmpNpmrcPath).split('\n');
	for (let i = 0; i < tmpLines.length; i++)
	{
		let tmpMatch = tmpLines[i].match(/^\s*registry\s*=\s*(.+?)\s*$/);
		if (tmpMatch) { tmpRegistry = tmpMatch[1]; }
	}

	let tmpConfig = readJSON(tmpConfigPath);

	return {
		NpmrcPath: tmpNpmrcPath,
		NpmrcRegistry: tmpRegistry,                 // '' when there is no registry line
		ConfigPath: tmpConfigPath,
		ConfigURL: tmpConfig.RegistryURL || ''      // '' when unset (the rnp default applies)
	};
}

/**
 * Apply a target to both files in pDirectory. Returns a summary for the handler to print.
 * The `.retold-npm-proxy.json` is only written when it would carry content or already exists,
 * so `use off` on a machine that never had one does not litter an empty `{}`.
 * @param {string} pDirectory
 * @param {{ Off: boolean, URL: string }} pTarget
 */
function apply(pDirectory, pTarget)
{
	let tmpNpmrcPath = libPath.join(pDirectory, _NPMRC);
	let tmpConfigPath = libPath.join(pDirectory, _CONFIG);

	let tmpBefore = readState(pDirectory);

	libFS.writeFileSync(tmpNpmrcPath, rewriteNpmrc(readText(tmpNpmrcPath), pTarget));

	let tmpConfigExisted = libFS.existsSync(tmpConfigPath);
	let tmpConfig = rewriteConfig(readJSON(tmpConfigPath), pTarget);
	if (Object.keys(tmpConfig).length > 0 || tmpConfigExisted)
	{
		libFS.writeFileSync(tmpConfigPath, JSON.stringify(tmpConfig, null, '\t') + '\n');
	}

	return { Directory: pDirectory, NpmrcPath: tmpNpmrcPath, ConfigPath: tmpConfigPath, Before: tmpBefore, After: readState(pDirectory) };
}

/**
 * What npm actually resolves `registry` to from a directory. This respects npm's local-prefix
 * rule (it reads the .npmrc of the nearest package.json), which is exactly why it can differ
 * from the monorepo-root .npmrc you just edited. Returns '' if npm cannot be run.
 * @param {string} pCwd
 * @returns {string}
 */
function npmEffectiveRegistry(pCwd)
{
	try
	{
		let tmpRun = libChildProcess.spawnSync('npm', [ 'config', 'get', 'registry' ], { cwd: pCwd || process.cwd(), encoding: 'utf8' });
		return String(tmpRun.stdout || '').trim();
	}
	catch (pError) { return ''; }
}

module.exports = { normalizeTarget, rewriteNpmrc, rewriteConfig, targetDirectory, readState, apply, npmEffectiveRegistry, LocalURL: _LOCAL_URL };
