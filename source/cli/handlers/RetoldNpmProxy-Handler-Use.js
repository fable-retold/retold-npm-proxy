/**
 * Handler: `rnp use <url|local|off>` -- point npm AND this tool at a registry (or off) in one
 * move, by rewriting the `.npmrc` `registry=` line and `.retold-npm-proxy.json` `RegistryURL`
 * together. `--global` writes to ~/.npmrc / ~/.retold-npm-proxy.json instead of the monorepo root.
 */
const libEnvironment = require('../../core/RetoldNpmProxy-Core-Environment.js');
const libRegistry = require('../../core/RetoldNpmProxy-Core-Registry.js');

module.exports = async function handleUse(pContext)
{
	let tmpOptions = pContext.Options || {};
	let tmpToken = (pContext.Arguments || [])[0] || '';
	if (!tmpToken)
	{
		console.log('Usage: rnp use <url> | local | off   [--global]');
		console.log('  e.g. rnp use http://nas.local:4873   |   rnp use nas.local   |   rnp use local   |   rnp use off');
		process.exitCode = 1;
		return;
	}

	let tmpTarget = libEnvironment.normalizeTarget(tmpToken);
	let tmpDirectory = libEnvironment.targetDirectory(tmpOptions);
	let tmpResult = libEnvironment.apply(tmpDirectory, tmpTarget);

	if (tmpTarget.Off)
	{
		console.log(`Removed the registry override in ${tmpResult.NpmrcPath}.`);
		console.log('npm now falls back to the public registry (https://registry.npmjs.org/).');
		return;
	}

	console.log(`Pointed at ${tmpTarget.URL}`);
	console.log(`  npm  ${tmpResult.NpmrcPath}`);
	console.log(`         registry=${tmpTarget.URL}/`);
	console.log(`  rnp  ${tmpResult.ConfigPath}`);
	console.log(`         RegistryURL=${tmpTarget.URL}`);

	let tmpUp = await libRegistry.ping(tmpTarget.URL);
	console.log(`  reachable: ${tmpUp ? 'yes' : 'no  (start it, or check the host/port)'}`);

	// The monorepo-root .npmrc only governs npm run from the root and non-package subdirs; installs
	// run inside a module read that module's own .npmrc. `--global` covers those too.
	if (!(tmpOptions.global || tmpOptions.Global))
	{
		console.log('');
		console.log('Note: this .npmrc governs npm from the monorepo root (and non-package subdirs). Installs run');
		console.log('      inside an individual module read that module\'s own .npmrc -- use `--global` to cover those.');
	}
};
