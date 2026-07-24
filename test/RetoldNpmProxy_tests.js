/**
 * retold-npm-proxy tests.
 *
 * Offline unit coverage of the parts that do not need a running registry: the command
 * map shape, registry-directory discovery, and the lockfile tarball collection that
 * feeds the warehouse. The start/stop/publish paths are exercised by hand against a
 * live registry (they shell out and talk HTTP).
 */
const libAssert = require('assert');
const libFS = require('fs');
const libOS = require('os');
const libPath = require('path');

const libProxy = require('../source/RetoldNpmProxy.cjs');

suite('retold-npm-proxy', () =>
{
	test('the command map exposes the expected commands', () =>
	{
		let tmpKeywords = libProxy.CommandMap.map((pEntry) => pEntry.Keyword);
		[ 'status', 'start', 'stop', 'warehouse', 'publish' ].forEach((pKeyword) =>
		{
			libAssert.ok(tmpKeywords.indexOf(pKeyword) >= 0, `command [${pKeyword}] should be registered`);
			libAssert.ok(typeof libProxy.CommandMap.find((pE) => pE.Keyword === pKeyword).Handler === 'function', `command [${pKeyword}] needs a handler`);
		});
	});

	test('registry directory resolves to the sibling registry folder by default', () =>
	{
		let tmpDir = libProxy.Registry.resolveRegistryDir({});
		libAssert.strictEqual(libPath.basename(tmpDir), 'registry', 'the resolved path should be a registry/ folder');
	});

	test('an explicit --registry-dir wins', () =>
	{
		let tmpDir = libProxy.Registry.resolveRegistryDir({ registryDir: '/tmp/somewhere/registry' });
		libAssert.strictEqual(tmpDir, libPath.resolve('/tmp/somewhere/registry'));
	});

	test('the warehouse collector pulls registry tarballs from a lockfile and skips the rest', () =>
	{
		let tmpTmp = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'rnp-test-'));
		let tmpLock =
			{
				lockfileVersion: 3,
				packages:
					{
						'': { name: 'root', version: '1.0.0' },
						'node_modules/fable': { version: '3.1.80', resolved: 'https://registry.npmjs.org/fable/-/fable-3.1.80.tgz' },
						'node_modules/local': { version: '0.0.1', resolved: 'file:../local' },
						'node_modules/git-dep': { version: '1.0.0', resolved: 'git+https://github.com/x/y.git#abc' }
					}
			};
		libFS.writeFileSync(libPath.join(tmpTmp, 'package-lock.json'), JSON.stringify(tmpLock));

		let tmpSet = new Set();
		libProxy.Warehouse.collectTarballs(libPath.join(tmpTmp, 'package-lock.json'), tmpSet);
		let tmpTarballs = [ ...tmpSet ];

		libAssert.strictEqual(tmpTarballs.length, 1, 'only the one registry tarball should be collected');
		libAssert.strictEqual(tmpTarballs[0], 'https://registry.npmjs.org/fable/-/fable-3.1.80.tgz');
		libFS.rmSync(tmpTmp, { recursive: true, force: true });
	});

	test('scoped package names encode for the registry PUT path; unscoped pass through', () =>
	{
		libAssert.strictEqual(libProxy.Publish.encodePackageName('retold-deploy-tool'), 'retold-deploy-tool');
		libAssert.strictEqual(libProxy.Publish.encodePackageName('@retold/foundation'), '@retold%2ffoundation');
	});
});
