/**
 * Handler: `rnp start [--docker] [--foreground] [--port n]`.
 */
const libRegistry = require('../../core/RetoldNpmProxy-Core-Registry.js');

module.exports = async function handleStart(pContext)
{
	let tmpOptions = pContext.Options || {};
	let tmpURL = libRegistry.registryURL(tmpOptions);

	if (await libRegistry.ping(tmpURL))
	{
		console.log(`Registry already up at ${tmpURL}.`);
		return;
	}

	let tmpResult = libRegistry.start(tmpOptions);
	console.log(tmpResult.Message);

	if (tmpResult.Detached)
	{
		// Give it a moment, then confirm it answered.
		await new Promise((pResolve) => setTimeout(pResolve, 2500));
		let tmpUp = await libRegistry.ping(tmpURL);
		console.log(tmpUp ? `Registry is up at ${tmpURL}.` : `Started, but ${tmpURL} did not answer yet -- check the log.`);
		console.log(`Point npm at it:  registry=${tmpURL}/     Stop it:  rnp stop${tmpOptions.docker ? ' --docker' : ''}`);
	}
};
