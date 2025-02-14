/* eslint-disable camelcase */
const { getOctokit, context } = require('@actions/github');
const core = require('@actions/core');
const { getConfig } = require('./config');

class GitHubClient {
  constructor(token) {
    if (!token) {
      throw new Error('GitHub token is required but not provided.');
    }

    this.octokit = getOctokit(token);
    this.context = context;
    this.repo = context.repo;
    this.pullNumber = context.payload.pull_request?.number;
    this.triggerCommand = getConfig().triggerCommand;
  }

  validatePullRequest() {
    if (this.context.eventName === 'issue_comment') {
      const comment = this.context.payload.comment;

      if (!this.context.payload.issue?.pull_request) {
        core.info('Comment is not on a pull request');
        return false;
      }

      if (!comment.body.includes(this.triggerCommand)) {
        core.info(`Comment does not contain trigger command: ${this.triggerCommand}`);
        return false;
      }

      this.pullNumber = this.context.payload.issue.number;
    }

    if (!this.pullNumber) {
      core.error('No pull request number found');
      return false;
    }

    return true;
  }

  async getPullRequestDetails() {
    if (!this.validatePullRequest()) {
      core.info('Pull request validation failed');
      return null;
    }

    try {
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.repo.owner,
        repo: this.repo.repo,
        pull_number: this.pullNumber,
      });
      return pr;
    } catch (error) {
      core.error(`Failed to fetch PR: ${error.message}`);
      return null;
    }
  }

  async getDiff() {
    const { data: rawDiff } = await this.octokit.rest.pulls.get({
      owner: this.repo.owner,
      repo: this.repo.repo,
      pull_number: this.pullNumber,
      mediaType: { format: 'diff' },
    });
    return rawDiff;
  }

  async submitReview(comments) {
    try {
      const validComments = comments.filter((c) =>
        c.position > 0 &&
          c.path &&
          c.body?.length > 0
      );

      core.debug(`Valid comments: ${JSON.stringify(validComments)}`);

      if (validComments.length > 0) {
        await this.octokit.rest.pulls.createReview({
          owner: this.repo.owner,
          repo: this.repo.repo,
          pull_number: this.pullNumber,
          event: 'COMMENT',
          comments: validComments,
          body: '🧠 Here are Code Reviews by _SenpAI_:'
        });
        core.info(`Submitted ${validComments.length} valid comments`);
      } else {
        await this.octokit.rest.issues.createComment({
          owner: this.repo.owner,
          repo: this.repo.repo,
          issue_number: this.pullNumber,
          body: '✅ **LGTM!** No issues found\n\n_Code meets quality standards_'
        });
        core.info('Posted LGTM comment');
      }
    } catch (error) {
      core.error(`Review failed: ${error.message}`);
      if (error.errors) {
        error.errors.forEach((err) => core.error(JSON.stringify(err)));
      }
      throw error;
    }
  }
}

module.exports = GitHubClient;
