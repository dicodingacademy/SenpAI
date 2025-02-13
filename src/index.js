const core = require('@actions/core');
const { minimatch } = require('minimatch');
const { getConfig } = require('./lib/config');
const GithubClient = require('./lib/github-client');
const GeminiClient = require('./lib/gemini-client');
const { parseGitDiff } = require('./lib/diff-parser');

async function run() {
  try {
    const { githubToken, apiKey, modelName, excludeFiles } = getConfig();

    const githubClient = new GithubClient(githubToken);
    const geminiClient = new GeminiClient(apiKey, modelName);

    const prDetails = await githubClient.getPullRequestDetails();
    if (!prDetails) {
      core.setFailed('Could not retrieve PR details');
      return;
    }

    const rawDiff = await githubClient.getDiff();
    const parsedDiffFiles= parseGitDiff(rawDiff);

    const filteredFiles = parsedDiffFiles.filter((file) => {
      if (file.type === 'delete') {
        return false;
      }

      return !excludeFiles.some((pattern) =>
        minimatch(file.newPath, pattern, {
          dot: true,
          matchBase: true
        })
      );
    });

    core.info(`Processing ${filteredFiles.length} files after exclusions`);
    const reviews = await geminiClient.reviewFiles(filteredFiles, prDetails);

    await githubClient.submitReview(reviews);
    core.info('Action completed successfully');
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    console.error(error.stack);
  }
}

run();
