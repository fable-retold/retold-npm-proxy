/**
 * RetoldNpmProxy -- programmatic entry point.
 *
 * The CLI (source/cli/*) is the primary interface, but the cores are exported here so
 * another tool (or a test) can drive the registry, warehouse, or publish directly.
 */
module.exports =
	{
		Registry: require('./core/RetoldNpmProxy-Core-Registry.js'),
		Warehouse: require('./core/RetoldNpmProxy-Core-Warehouse.js'),
		Publish: require('./core/RetoldNpmProxy-Core-Publish.js'),
		Token: require('./core/RetoldNpmProxy-Core-Token.js'),
		Environment: require('./core/RetoldNpmProxy-Core-Environment.js'),
		CommandMap: require('./cli/RetoldNpmProxy-CommandMap.cjs')
	};
