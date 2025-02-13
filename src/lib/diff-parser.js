const { parse } = require('gitdiff-parser');
const core = require('@actions/core');

function parseGitDiff(diffText){
  try {
    return parse(diffText);
  } catch (error) {
    core.error(`Failed to parse diff: ${error.message}`);
    return [];
  }
}

module.exports = { parseGitDiff };