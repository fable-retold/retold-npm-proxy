/**
 * Handler: `rnp stop [--docker] [--port n]`.
 */
const libRegistry = require('../../core/RetoldNpmProxy-Core-Registry.js');

module.exports = async function handleStop(pContext)
{
	let tmpOptions = pContext.Options || {};
	let tmpResult = libRegistry.stop(tmpOptions);
	console.log(tmpResult.Message);
	if (!tmpResult.Stopped) { process.exitCode = 1; }
};
