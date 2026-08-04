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

	test('the command map includes the new use and where commands', () =>
	{
		let tmpKeywords = libProxy.CommandMap.map((pEntry) => pEntry.Keyword);
		[ 'use', 'where' ].forEach((pKeyword) =>
		{
			libAssert.ok(tmpKeywords.indexOf(pKeyword) >= 0, `command [${pKeyword}] should be registered`);
			libAssert.ok(typeof libProxy.CommandMap.find((pE) => pE.Keyword === pKeyword).Handler === 'function', `command [${pKeyword}] needs a handler`);
		});
	});

	test('normalizeTarget resolves local, off, full URLs, and bare hosts', () =>
	{
		let tmpEnv = libProxy.Environment;
		libAssert.deepStrictEqual(tmpEnv.normalizeTarget('local'), { Off: false, URL: 'http://localhost:4873' });
		libAssert.deepStrictEqual(tmpEnv.normalizeTarget('off'), { Off: true, URL: '' });
		libAssert.deepStrictEqual(tmpEnv.normalizeTarget('public'), { Off: true, URL: '' });
		libAssert.strictEqual(tmpEnv.normalizeTarget('http://nas.local:4873/').URL, 'http://nas.local:4873');
		libAssert.strictEqual(tmpEnv.normalizeTarget('nas.local').URL, 'http://nas.local:4873');
		libAssert.strictEqual(tmpEnv.normalizeTarget('nas.local:9000').URL, 'http://nas.local:9000');
	});

	test('rewriteNpmrc sets, replaces, and clears the registry line while keeping the rest', () =>
	{
		let tmpEnv = libProxy.Environment;
		let tmpSet = { Off: false, URL: 'http://nas.local:4873' };
		let tmpOff = { Off: true, URL: '' };

		libAssert.strictEqual(tmpEnv.rewriteNpmrc('package-lock=false\n', tmpSet), 'package-lock=false\nregistry=http://nas.local:4873/\n');
		libAssert.strictEqual(tmpEnv.rewriteNpmrc('registry=http://localhost:4873/\npackage-lock=false\n', tmpSet), 'registry=http://nas.local:4873/\npackage-lock=false\n');
		libAssert.strictEqual(tmpEnv.rewriteNpmrc('registry=http://localhost:4873/\npackage-lock=false\n', tmpOff), 'package-lock=false\n');
		libAssert.strictEqual(tmpEnv.rewriteNpmrc('registry=http://localhost:4873/\n', tmpOff), '');
	});

	test('rewriteConfig sets and clears RegistryURL without disturbing other keys', () =>
	{
		let tmpEnv = libProxy.Environment;
		libAssert.deepStrictEqual(
			tmpEnv.rewriteConfig({ PublisherUser: 'retold-local' }, { Off: false, URL: 'http://nas.local:4873' }),
			{ PublisherUser: 'retold-local', RegistryURL: 'http://nas.local:4873' });
		libAssert.deepStrictEqual(
			tmpEnv.rewriteConfig({ PublisherUser: 'retold-local', RegistryURL: 'http://old:4873' }, { Off: true, URL: '' }),
			{ PublisherUser: 'retold-local' });
	});

	test('a .retold-npm-proxy.json RegistryURL is read by the registry resolver (the config-file path)', () =>
	{
		let tmpTmp = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'rnp-cfg-'));
		libFS.writeFileSync(libPath.join(tmpTmp, '.retold-npm-proxy.json'), JSON.stringify({ RegistryURL: 'http://nas.local:4873' }));
		let tmpConfig = libProxy.Registry.gatheredConfig(tmpTmp);
		libAssert.strictEqual(tmpConfig.RegistryURL, 'http://nas.local:4873', 'gatheredConfig should read the config file');
		libFS.rmSync(tmpTmp, { recursive: true, force: true });
	});

	test('apply writes both files and readState reads them back (and off clears them)', () =>
	{
		let tmpEnv = libProxy.Environment;
		let tmpTmp = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'rnp-use-'));
		libFS.writeFileSync(libPath.join(tmpTmp, '.npmrc'), 'package-lock=false\n');

		tmpEnv.apply(tmpTmp, { Off: false, URL: 'http://nas.local:4873' });
		let tmpState = tmpEnv.readState(tmpTmp);
		libAssert.strictEqual(tmpState.NpmrcRegistry, 'http://nas.local:4873/');
		libAssert.strictEqual(tmpState.ConfigURL, 'http://nas.local:4873');
		libAssert.ok(libFS.readFileSync(libPath.join(tmpTmp, '.npmrc'), 'utf8').indexOf('package-lock=false') >= 0, 'other .npmrc lines survive');

		tmpEnv.apply(tmpTmp, { Off: true, URL: '' });
		let tmpOffState = tmpEnv.readState(tmpTmp);
		libAssert.strictEqual(tmpOffState.NpmrcRegistry, '', 'off clears the registry line');
		libAssert.strictEqual(tmpOffState.ConfigURL, '', 'off clears RegistryURL');
		libFS.rmSync(tmpTmp, { recursive: true, force: true });
	});
});
