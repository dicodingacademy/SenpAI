const core = require('@actions/core');

function parseComment(aiResponse) {
  try {
    const rawText = aiResponse.response?.text() || '';
    core.debug(`Raw AI response: ${rawText}`);

    let jsonText = rawText;

    if (jsonText.startsWith('```json') && jsonText.endsWith('```')) {
      jsonText = jsonText.slice(7, -3).trim();
    }
    else if (jsonText.startsWith('```') && jsonText.endsWith('```')) {
      jsonText = jsonText.slice(3, -3).trim();
    }

    const result = JSON.parse(jsonText);

    if (!result || typeof result !== 'object') {
      core.error('Invalid response format - not an object');
      return [];
    }

    if (!result.comments || !Array.isArray(result.comments)) {
      core.error('Invalid comments format - missing or invalid comments array');
      return [];
    }

    const validComments = result.comments.filter((comment) => {
      if (!comment || typeof comment !== 'object') return false;

      const hasValidLine = typeof comment.line === 'number' && comment.line > 0;
      const hasValidComment = typeof comment.comment === 'string' && comment.comment.trim().length > 0;

      if (!hasValidLine) core.debug(`Invalid line number in comment: ${comment.line}`);
      if (!hasValidComment) core.debug(`Invalid comment text: ${comment.comment}`);

      return hasValidLine && hasValidComment;
    });

    core.info(`Found ${validComments.length} valid comments`);
    return validComments;

  } catch (error) {
    core.error(`Failed to parse AI response: ${error.message}`);
    core.debug(`Stack trace: ${error.stack}`);
    return [];
  }
}

module.exports = { parseComment };