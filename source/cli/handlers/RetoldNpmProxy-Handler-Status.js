/**
 * Handler: `rnp status` -- is the registry up, and how big is the warehouse?
 */
const libRegistry = require('../../core/RetoldNpmProxy-Core-Registry.js');

function humanBytes(pBytes)
{
	if (!pBytes) { return '0 B'; }
	let tmpUnits = [ 'B', 'KB', 'MB', 'GB', 'TB' ];
	let tmpIndex = Math.floor(Math.log(pBytes) / Math.log(1024));
	return `${(pBytes / Math.pow(1024, tmpIndex)).toFixed(tmpIndex === 0 ? 0 : 1)} ${tmpUnits[tmpIndex]}`;
}

module.exports = async function handleStatus(pContext)
{
	let tmpOptions = pContext.Options || {};
	let tmpRegistryDir = libRegistry.resolveRegistryDir(tmpOptions);
	let tmpURL = libRegistry.registryURL(tmpOptions);

	let tmpUp = await libRegistry.ping(tmpURL);
	let tmpStats = libRegistry.storageStats(tmpRegistryDir);

	console.log(`Registry dir: ${tmpRegistryDir}`);
	console.log(`URL:          ${tmpURL}`);
	console.log(`Status:       ${tmpUp ? 'UP' : 'down'}`);
	if (tmpStats.Exists)
	{
		console.log(`Warehouse:    ${tmpStats.Tarballs} tarball(s) across ${tmpStats.Packages} package(s), ${humanBytes(tmpStats.Bytes)}`);
	}
	else
	{
		console.log('Warehouse:    (empty -- run `rnp warehouse`)');
	}
	if (!tmpUp)
	{
		console.log('');
		console.log('Start it with:  rnp start        (or `rnp start --docker`)');
		process.exitCode = 1;
	}
};
