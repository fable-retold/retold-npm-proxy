/**
 * Handler: `rnp timemachine` -- pull EVERY published version of every package referenced in any
 * package.json across the monorepo through the proxy, so Verdaccio mirrors the whole version
 * history (an old checkout then installs straight from the proxy). `warehouse` caches the
 * lockfile-pinned versions; this caches all of them. It is a BIG pull -- run `--plan` first.
 */
const libPath = require('path');

const libTimeMachine = require('../../core/RetoldNpmProxy-Core-TimeMachine.js');
const libRegistry = require('../../core/RetoldNpmProxy-Core-Registry.js');

module.exports = async function handleTimeMachine(pContext)
{
	let tmpOptions = pContext.Options || {};
	let tmpURL = libRegistry.registryURL(tmpOptions);
	let tmpRoot = tmpOptions.root || libRegistry.monorepoRoot(tmpOptions);
	let tmpPlan = !!tmpOptions.plan;

	console.log((tmpPlan ? 'Planning' : 'Time-machining') + ' every referenced package version under ' + tmpRoot);
	console.log('  registry: ' + tmpURL);

	let tmpResult = await libTimeMachine.timemachine(
		{
			registryURL: tmpURL,
			root: tmpRoot,
			concurrency: tmpOptions.concurrency,
			stableOnly: !!tmpOptions.stableOnly,
			gitHistory: !!tmpOptions.gitHistory,
			planOnly: tmpPlan,
			resumeFile: tmpPlan ? null : (tmpOptions.resume || libPath.join(tmpRoot, '.rnp-timemachine-progress')),
			onRepo: (pR) =>
			{
				process.stdout.write('\r  scanning git history ' + pR.Done + '/' + pR.Total + ' repos     ');
				if (pR.Done === pR.Total) { process.stdout.write('\n'); }
			},
			onPackument: (pP) =>
			{
				process.stdout.write('\r  reading metadata ' + pP.Done + '/' + pP.Total + '     ');
				if (pP.Done === pP.Total) { process.stdout.write('\n'); }
			},
			onProgress: (pP) =>
			{
				process.stdout.write('\r  tarballs ' + pP.Done + '/' + pP.Total + '  (ok ' + pP.OK + ', fail ' + pP.Fail + (pP.Skip ? ', skip ' + pP.Skip : '') + ')     ');
			},
			onFailure: (pF) =>
			{
				process.stdout.write('\n  FAIL  ' + pF.Reason + '  ' + pF.URL + '\n');
			}
		});
	if (!tmpPlan) { process.stdout.write('\n'); }

	console.log('');
	console.log('Packages referenced: ' + tmpResult.Packages + (tmpResult.HistoryAdded ? '  (+' + tmpResult.HistoryAdded + ' from git history)' : ''));
	console.log('Versions (tarballs): ' + tmpResult.Versions);
	if (tmpResult.NoMetadata.length > 0)
	{
		console.log('No public metadata:  ' + tmpResult.NoMetadata.length + ' (private/unpublished -- skipped): ' + tmpResult.NoMetadata.slice(0, 8).join(', ') + (tmpResult.NoMetadata.length > 8 ? ' ...' : ''));
	}

	if (tmpResult.Planned)
	{
		console.log('');
		console.log('That is the scope. Run without --plan to pull them all (resumable; big -- expect tens of GB and a long run).');
		return;
	}

	console.log('Cached:              ' + tmpResult.OK + (tmpResult.Skip ? '  (skipped ' + tmpResult.Skip + ' already done)' : ''));
	console.log('Failed:              ' + tmpResult.Fail);
	if (tmpResult.Failed && tmpResult.Failed.length > 0)
	{
		tmpResult.Failed.slice(0, 50).forEach((pF) => console.log('  ' + pF.Reason + '  ' + pF.URL));
		if (tmpResult.Failed.length > 50) { console.log('  ... and ' + (tmpResult.Failed.length - 50) + ' more'); }
		console.log('(full list also written to <resume-file>.failures)');
	}
	if (tmpResult.Fail > 0) { process.exitCode = 1; }
};
