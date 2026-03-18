/**
 * Security Utilities for DFtracker
 * XSS Protection and Error Sanitization
 */

import { t } from '../i18n.js';

const NOT_FOUND_PATTERNS = [
    '404',
    'not_found',
    'not found',
    'data tidak ditemukan',
    'data could not be found',
    '未找到',
];

const NETWORK_PATTERNS = [
    'failed to fetch',
    'network',
    'unable to reach the service',
    'gagal terhubung ke layanan',
    '无法连接到服务',
];

const PENDING_PATTERNS = [
    'timeout',
    'timed out',
    'data stat kosong',
];

function collectErrorMessages(err) {
    const messages = new Set();
    let current = err;

    while (current) {
        if (typeof current === 'string') {
            messages.add(current);
            break;
        }

        if (typeof current?.message === 'string' && current.message) {
            messages.add(current.message);
        }

        current = current?.cause;
    }

    messages.add(t('app.errors.notFound'));
    messages.add(t('app.errors.network'));
    messages.add(t('app.errors.system'));

    return [...messages]
        .filter(Boolean)
        .map((message) => String(message).toLowerCase());
}

function includesAny(messages, patterns) {
    return messages.some((message) => patterns.some((pattern) => message.includes(pattern)));
}

export function classifyAppError(err) {
    if (err?.errorKind) {
        return err.errorKind;
    }

    const messages = collectErrorMessages(err);

    if (includesAny(messages, NOT_FOUND_PATTERNS)) {
        return 'not_found';
    }

    if (includesAny(messages, NETWORK_PATTERNS)) {
        return 'network';
    }

    if (includesAny(messages, PENDING_PATTERNS)) {
        return 'pending';
    }

    return 'unknown';
}

export function isAppErrorKind(err, kind) {
    return classifyAppError(err) === kind;
}

export function isRetryableAppError(err) {
    const kind = classifyAppError(err);
    return kind === 'not_found' || kind === 'network' || kind === 'pending';
}

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
    const kind = classifyAppError(err);

    if (kind === 'not_found') {
        return t('app.errors.notFound');
    }

    if (kind === 'network') {
        return t('app.errors.network');
    }

    if (msg.includes('{') || msg.includes('protocol')) {
        return t('app.errors.system');
    }

    return msg;
}
