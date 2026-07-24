/**
 * Handler: `rnp warehouse [--root path] [--concurrency n]` -- mirror the monorepo's
 * whole dependency closure into the registry storage.
 */
const libRegistry = require('../../core/RetoldNpmProxy-Core-Registry.js');
const libWarehouse = require('../../core/RetoldNpmProxy-Core-Warehouse.js');

module.exports = async function handleWarehouse(pContext)
{
	let tmpOptions = pContext.Options || {};
	let tmpURL = libRegistry.registryURL(tmpOptions);
	let tmpRoot = tmpOptions.root || libRegistry.monorepoRoot(tmpOptions);

	if (!(await libRegistry.ping(tmpURL)))
	{
		console.error(`Registry is not up at ${tmpURL}. Start it first:  rnp start`);
		process.exitCode = 1;
		return;
	}

	console.log(`Warehousing every lockfile under ${tmpRoot} -> ${tmpURL}`);
	let tmpLast = 0;
	let tmpResult = await libWarehouse.warehouse(
		{
			registryURL: tmpURL,
			root: tmpRoot,
			concurrency: tmpOptions.concurrency,
			onProgress: (pProgress) =>
			{
				if (pProgress.Done - tmpLast >= 25 || pProgress.Done === pProgress.Total)
				{
					tmpLast = pProgress.Done;
					process.stdout.write(`\r  ${pProgress.Done}/${pProgress.Total}  (ok ${pProgress.OK}, fail ${pProgress.Fail})   `);
				}
			}
		});
	process.stdout.write('\n');

	console.log(`Lockfiles:    ${tmpResult.Lockfiles}`);
	console.log(`Unique deps:  ${tmpResult.Unique}`);
	console.log(`Cached:       ${tmpResult.OK}`);
	console.log(`Failed:       ${tmpResult.Fail}`);
	if (tmpResult.Failed.length > 0)
	{
		tmpResult.Failed.slice(0, 5).forEach((pURL) => console.log(`  - ${pURL}`));
	}
	if (tmpResult.Fail > 0) { process.exitCode = 1; }
};
