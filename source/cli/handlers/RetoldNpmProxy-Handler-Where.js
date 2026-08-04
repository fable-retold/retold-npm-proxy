/**
 * Handler: `rnp where` -- show where npm and this tool currently point, and whether it answers.
 * Reads the monorepo-root and ~/ `.npmrc` registry lines, the rnp `RegistryURL`, npm's own
 * effective registry (which can differ, thanks to npm's local-prefix rule), and pings the target.
 */
const libEnvironment = require('../../core/RetoldNpmProxy-Core-Environment.js');
const libRegistry = require('../../core/RetoldNpmProxy-Core-Registry.js');

module.exports = async function handleWhere(pContext)
{
	let tmpOptions = pContext.Options || {};

	let tmpRootState = libEnvironment.readState(libRegistry.monorepoRoot(tmpOptions));
	let tmpHomeState = libEnvironment.readState(require('os').homedir());
	let tmpRnpURL = tmpRootState.ConfigURL || libEnvironment.LocalURL;
	let tmpEffective = libEnvironment.npmEffectiveRegistry(process.cwd());

	console.log('npm registry line (.npmrc):');
	console.log(`  ${tmpRootState.NpmrcPath}`);
	console.log(`      ${tmpRootState.NpmrcRegistry ? 'registry=' + tmpRootState.NpmrcRegistry : '(no registry line -> public npm)'}`);
	console.log(`  ${tmpHomeState.NpmrcPath}`);
	console.log(`      ${tmpHomeState.NpmrcRegistry ? 'registry=' + tmpHomeState.NpmrcRegistry : '(no registry line)'}`);
	console.log(`  npm effective, from ${process.cwd()}:`);
	console.log(`      ${tmpEffective || '(could not run npm)'}`);

	console.log('');
	console.log('rnp target (.retold-npm-proxy.json RegistryURL):');
	console.log(`  ${tmpRootState.ConfigURL ? tmpRnpURL : tmpRnpURL + '   (default; no RegistryURL set)'}`);

	let tmpUp = await libRegistry.ping(tmpRnpURL);
	console.log(`  reachable: ${tmpUp ? 'UP' : 'down'}`);
};
