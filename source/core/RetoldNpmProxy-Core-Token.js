/**
 * RetoldNpmProxy-Core-Token
 *
 * Get a bearer token to publish to the local registry. This is the whole "auth": the
 * tool registers a throwaway publisher user against Verdaccio's htpasswd and caches the
 * token in a gitignored file. No npm login dance, no enterprise account, no secrets.
 */
const libFS = require('fs');
const libPath = require('path');

// The cache lives beside the tool so it survives across invocations but never commits.
function cacheFilePath()
{
	return libPath.resolve(__dirname, '..', '..', '.retold-npm-proxy-token');
}

function readCachedToken()
{
	try
	{
		let tmpRaw = libFS.readFileSync(cacheFilePath(), 'utf8').trim();
		return tmpRaw.length > 0 ? tmpRaw : null;
	}
	catch (pError) { return null; }
}

function writeCachedToken(pToken)
{
	try { libFS.writeFileSync(cacheFilePath(), String(pToken), 'utf8'); } catch (pError) { /* best effort */ }
}

async function tokenIsValid(pURL, pToken)
{
	if (!pToken) { return false; }
	try
	{
		let tmpResponse = await fetch(pURL + '/-/whoami', { headers: { 'Authorization': 'Bearer ' + pToken } });
		return tmpResponse.ok;
	}
	catch (pError) { return false; }
}

// Register a user (couchdb-style) and return its token, or null on failure.
async function registerUser(pURL, pUser, pPassword)
{
	try
	{
		let tmpResponse = await fetch(pURL + '/-/user/org.couchdb.user:' + encodeURIComponent(pUser),
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: pUser, password: pPassword, _id: 'org.couchdb.user:' + pUser })
			});
		let tmpBody = await tmpResponse.json().catch(() => ({}));
		return tmpBody && tmpBody.token ? tmpBody.token : null;
	}
	catch (pError) { return null; }
}

/**
 * Ensure we have a working publish token for pURL.
 *   1. a valid cached token, else
 *   2. register the configured publisher user, else
 *   3. register a unique fallback user (sidesteps a pre-existing/mismatched account).
 * @returns {Promise<string>}
 */
async function ensureToken(pURL, pOptions)
{
	let tmpOptions = pOptions || {};
	let tmpForce = !!tmpOptions.force;

	if (!tmpForce)
	{
		let tmpCached = readCachedToken();
		if (await tokenIsValid(pURL, tmpCached)) { return tmpCached; }
	}

	let tmpUser = tmpOptions.PublisherUser || 'retold-local';
	let tmpPassword = tmpOptions.PublisherPassword || 'retold-local';

	let tmpToken = await registerUser(pURL, tmpUser, tmpPassword);
	if (!tmpToken)
	{
		// The configured user may already exist with a different password; a fresh,
		// unique publisher always succeeds on a permissive local registry.
		let tmpUnique = tmpUser + '-' + Date.now().toString(36);
		tmpToken = await registerUser(pURL, tmpUnique, tmpPassword);
	}
	if (!tmpToken) { throw new Error(`could not obtain a publish token from ${pURL} (is the registry running with an htpasswd auth block?)`); }

	writeCachedToken(tmpToken);
	return tmpToken;
}

module.exports = { ensureToken, readCachedToken, writeCachedToken, cacheFilePath };
