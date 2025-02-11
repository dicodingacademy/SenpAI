/* eslint-disable camelcase */
const { getOctokit, context } = require('@actions/github');
const core = require('@actions/core');

class GitHubClient {
  constructor(token) {
    if (!token) {
      throw new Error('GitHub token is required but not provided.');
    }

    this.context = context;
    this.octokit = getOctokit(token);
    this.core = core;
    this.owner = context.repo.owner;
    this.repo = context.repo.repo;
    this.pullNumber = context.payload.pull_request?.number || null;
  }

  validatePullRequest(triggerCommand) {
    if (this.context.eventName === 'issue_comment') {
      if (!this.context.payload.issue.pull_request) {
        this.core.info('Not a pull request comment, skipping');
        return false;
      }

      if (!this.context.payload.comment.body.includes(triggerCommand)) {
        this.core.info('No trigger command found, skipping');
        return false;
      }
    }
    return true;
  }

  async getPullRequestDetails() {
    if (!this.validatePullRequest()) {
      return null;
    }

    if (!this.pullNumber) {
      core.setFailed('No pull request found in context');
      return null;
    }

    try {
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.pullNumber,
      });

      return pr;
    } catch (error) {
      this.core.error(`Failed to fetch PR details: ${error.message}`);
      return null;
    }
  }

  async getDiff() {
    const { data: rawDiff } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: this.pullNumber,
      mediaType: { format: 'diff' },
    });

    return rawDiff;
  }

  async submitReview(comments) {
    if (comments.length > 0) {
      await this.octokit.rest.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.pullNumber,
        event: 'COMMENT',
        comments,
        body: 'Here are Code Reviews by _SenpAI_'
      });
      core.info(`Submitted ${comments.length} review comments`);
    } else {
      await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: this.pullNumber,
        body: '✅ **LGTM!** No issues found by SenpAI\n\n_Code meets quality standards_'
      });
      core.info('Posted LGTM comment');
    }
  }
}

module.exports = GitHubClient;
