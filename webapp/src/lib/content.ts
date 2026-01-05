/**
 * Replace content placeholders with user data
 */

export function replaceContentPlaceholders(content: string | null | undefined, userData?: { firstName?: string; username?: string }): string {
  if (!content) return '';

  let result = content;

  // Get user name (prefer firstName, fallback to username)
  const userName = userData?.firstName || userData?.username || 'друг';

  // Replace all variations of #{name} placeholder (case insensitive, with or without spaces)
  result = result.replace(/#{name}/gi, userName);
  result = result.replace(/#\{name\}/gi, userName);
  result = result.replace(/# \{name\}/gi, userName);
  result = result.replace(/#{name }/gi, userName);
  result = result.replace(/# \{ name \}/gi, userName);

  // Clean up invisible Unicode characters that might remain
  result = result.replace(/\u200d/g, ''); // zero-width joiner
  result = result.replace(/\u200b/g, ''); // zero-width space
  result = result.replace(/\u200c/g, ''); // zero-width non-joiner

  return result;
}
