/**
 * Handler: `rnp publish <module-dir> [--tag tag]`.
 *
 * Publishes a private retold package into the local registry via a direct tarball PUT,
 * so the module's package.json `private: true` is preserved (nothing on disk is touched)
 * and it can never leak to public npm.
 */
const libPath = require('path');
const libRegistry = require('../../core/RetoldNpmProxy-Core-Registry.js');
const libPublish = require('../../core/RetoldNpmProxy-Core-Publish.js');

module.exports = async function handlePublish(pContext)
{
	let tmpOptions = pContext.Options || {};
	let tmpArguments = pContext.Arguments || [];
	let tmpModuleDir = tmpArguments[0];

	if (!tmpModuleDir)
	{
		console.error('Usage: rnp publish <module-dir> [--tag latest]');
		process.exitCode = 1;
		return;
	}

	let tmpURL = libRegistry.registryURL(tmpOptions);
	if (!(await libRegistry.ping(tmpURL)))
	{
		console.error(`Registry is not up at ${tmpURL}. Start it first:  rnp start`);
		process.exitCode = 1;
		return;
	}

	// Publisher credentials come from the gathered program config; fall back to defaults.
	let tmpConfig = (pContext.Program && pContext.Program.settings) ? pContext.Program.settings : {};
	let tmpResult = await libPublish.publishModule(libPath.resolve(tmpModuleDir),
		{
			url: tmpURL,
			tag: tmpOptions.tag || 'latest',
			PublisherUser: tmpConfig.PublisherUser,
			PublisherPassword: tmpConfig.PublisherPassword
		});

	console.log(`Published ${tmpResult.Name}@${tmpResult.Version} -> ${tmpResult.Registry}`);
	console.log(`  tarball: ${tmpResult.Tarball}  (source package.json untouched -- still private:true)`);
};
