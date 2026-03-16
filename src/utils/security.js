/**
 * Security Utilities for DFtracker
 * XSS Protection and Error Sanitization
 */

import { t } from '../i18n.js';

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str - Raw string from external source.
 * @returns {string} - Escaped string safe for innerHTML.
 */
export function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Sanitizes or masks error messages for public display.
 * @param {Error|string} err - Error object or string.
 * @returns {string} - User-friendly error message.
 */
export function sanitizeError(err) {
    const msg = typeof err === 'string' ? err : (err.message || 'Unknown Error');

    // Mask 404s with a friendlier message if it's an API specific code
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        return t('app.errors.notFound');
    }

    // Mask technical fetch details
    if (msg.includes('fetch') || msg.includes('Failed to fetch')) {
        return t('app.errors.network');
    }

    // Fallback to a generic message for anything too technical
    if (msg.includes('{') || msg.includes('protocol')) {
        return t('app.errors.system');
    }

    return msg;
}
