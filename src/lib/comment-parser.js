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

    return result.comments.filter((comment) => {
      if (!comment || typeof comment !== 'object') return false;

      const hasValidPosition = typeof comment.position === 'number' && comment.position > 0;
      const hasValidComment = typeof comment.comment === 'string' && comment.comment.trim().length > 0;

      if (!hasValidPosition) core.debug(`Invalid position number in comment: ${comment.position}`);
      if (!hasValidComment) core.debug(`Invalid comment text: ${comment.comment}`);

      return hasValidPosition && hasValidComment;
    });

  } catch (error) {
    core.error(`Failed to parse AI response: ${error.message}`);
    core.debug(`Stack trace: ${error.stack}`);
    return [];
  }
}

module.exports = { parseComment };