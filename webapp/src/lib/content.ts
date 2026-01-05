/**
 * Replace content placeholders with user data
 */

export function replaceContentPlaceholders(content: string | null | undefined, userData?: { firstName?: string; username?: string }): string {
  if (!content) return '';

  let result = content;

  // Get user name (prefer firstName, fallback to username)
  const userName = userData?.firstName || userData?.username || 'друг';

  // Replace #{name} placeholder
  result = result.replace(/#{name}/gi, userName);

  return result;
}
