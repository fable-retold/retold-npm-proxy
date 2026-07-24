/**
 * RetoldNpmProxy-CLIProgram
 *
 * Builds the pict-service-commandlineutility program from the declarative CommandMap.
 * This module constructs and exports the program instance; the bin shim
 * (RetoldNpmProxy-Run.cjs) calls `.run()` on it. Same convention as retold-monorepo-manager.
 */
const libCLIProgram = require('pict-service-commandlineutility');

const libPackage = require('../../package.json');
const libCommandMap = require('./RetoldNpmProxy-CommandMap.cjs');
const libCommandFactory = require('./RetoldNpmProxy-CommandFactory.cjs');

// Shared context every generated command hands to its handler.
let _Shared = { Package: libPackage };

let _CommandClasses = libCommandFactory.buildCommandClasses(libCommandMap, _Shared);

let _Program = new libCLIProgram(
	{
		"Product": "retold-npm-proxy",
		"Version": libPackage.version,
		"Description": libPackage.description,

		"Package": libPackage,

		// Keep the console quiet for a CLI -- handlers print their own user-facing output.
		"LogStreams":
			[
				{
					"level": "error",
					"streamtype": "process.stdout"
				}
			],

		"Command": "retold-npm-proxy",

		"DefaultProgramConfiguration": require('../config/RetoldNpmProxy-Default-Command-Configuration.cjs'),

		"ProgramConfigurationFileName": ".retold-npm-proxy.json",

		"AutoGatherProgramConfiguration": true,
		"AutoAddConfigurationExplanationCommand": true
	},
	_CommandClasses);

module.exports = _Program;
