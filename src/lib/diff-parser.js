function parseGitDiff(diffText) {
  const files = [];
  const lines = diffText.split('\n');
  let currentFile = null;
  let currentChunk = null;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile) files.push(currentFile);
      const paths = line.split(' ').slice(2);
      currentFile = {
        path: paths[1]?.substring(2) || 'unknown_file',
        chunks: []
      };
    } else if (line.startsWith('@@')) {
      const match = line.match(/\+(\d+)(,(\d+))?/);
      if (match) {
        currentChunk = {
          newStart: parseInt(match[1]),
          newLines: match[3] ? parseInt(match[3]) : 1,
          content: []
        };
        currentFile?.chunks.push(currentChunk);
      }
    } else if (currentChunk) {
      currentChunk.content.push(line);
    }
  }

  if (currentFile) files.push(currentFile);
  return files;
}

module.exports = { parseGitDiff };