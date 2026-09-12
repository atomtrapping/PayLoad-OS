/** Source-neutral bounds for a display containing every authority name.
 * Each name remains individually available in the observation's entities.
 * Byte, observation, watch, report and board-output limits are separate.
 */
export const REGULATORY_MAX_AUTHORITY_NAMES = 32;
export const REGULATORY_MAX_AUTHORITY_NAME_CHARS = 256;
export const REGULATORY_AUTHORITY_SEPARATOR = '; ';
export const REGULATORY_MAX_AUTHORITY_TEXT_CHARS = REGULATORY_MAX_AUTHORITY_NAMES * REGULATORY_MAX_AUTHORITY_NAME_CHARS
  + (REGULATORY_MAX_AUTHORITY_NAMES - 1) * REGULATORY_AUTHORITY_SEPARATOR.length;
