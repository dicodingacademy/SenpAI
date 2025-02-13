const core = require('@actions/core');

const getConfig = () => ({
  githubToken: core.getInput('GITHUB_TOKEN'),
  apiKey: core.getInput('GEMINI_API_KEY'),
  modelName: core.getInput('GEMINI_MODEL'),
  excludeFiles: core.getInput('EXCLUDE_FILES')
    .split(',')
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern && (pattern.startsWith('*') || pattern.startsWith('.'))),
  triggerCommand: core.getInput('TRIGGER_COMMAND'),
  languageReview: core.getInput('LANGUAGE_REVIEW'),
  toneResponse: core.getInput('TONE_RESPONSE'),
});

module.exports = { getConfig };