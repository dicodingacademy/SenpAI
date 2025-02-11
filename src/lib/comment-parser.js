const core = require('@actions/core');

function parseComment(aiResponse) {
  try {
    const rawText = aiResponse.response?.text() || '';
    core.debug(`Raw AI response: ${rawText}`);

    const jsonMatch = rawText.match(/{[\s\S]*?}/);
    if (!jsonMatch) {
      core.error('No JSON found in response');
      return [];
    }

    const cleanedText = jsonMatch[0]
      .replace(/^```json/, '')
      .replace(/```$/, '')
      .trim();

    const result = JSON.parse(cleanedText);

    if (!result.comments || !Array.isArray(result.comments)) {
      core.error('Invalid comments format');
      return [];
    }

    return result.comments.filter((c) =>
      typeof c.line === 'number' &&
            typeof c.comment === 'string'
    );
  } catch (error) {
    core.error(`Failed to parse AI response: ${error}`);
    return [];
  }
}

module.exports = { parseComment };