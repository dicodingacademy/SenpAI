const { parse } = require('gitdiff-parser');
const core = require('@actions/core');

function parseGitDiff(diffText){
  try {
    const parsed = parse(diffText);

    let globalPosition = 0;
    return parsed.map((file) => {
      file.hunks = file.hunks.map((hunk) => {
        hunk.changes = hunk.changes.map((change) => {
          globalPosition++;
          return {
            ...change,
            position: globalPosition
          };
        });
        return hunk;
      });
      return file;
    });
  } catch (error) {
    core.error(`Failed to parse diff: ${error.message}`);
    return [];
  }
}

module.exports = { parseGitDiff };