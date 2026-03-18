/**
 * DeltaForceAPI Client
 * Wrapper for the Connect Protocol API at https://api.deltaforceapi.com
 */

import { classifyAppError, sanitizeError } from '../utils/security.js';
import { getApiLanguage } from '../i18n.js';

const BASE_URL = '/api';

const HEADERS = {
    'Connect-Protocol-Version': '1',
    'Content-Type': 'application/json',
};

export const LANGUAGE_EN = 'LANGUAGE_EN';
export const LANGUAGE_ID = 'LANGUAGE_ID';
export const LANGUAGE_ZH_HANS = 'LANGUAGE_ZH_HANS';

/**
 * Generic POST request to the API
 */
async function apiPost(endpoint, body = {}) {
    try {
        const res = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`API Error (${res.status}): ${errorText}`);
        }

        return await res.json();
    } catch (err) {
        const wrappedError = new Error(sanitizeError(err), { cause: err });
        wrappedError.errorKind = classifyAppError(err);
        throw wrappedError;
    }
}

// ─── Auction Market ──────────────────────────────────────

export async function listAuctionItems({
    filter = '',
    orderBy = '',
    pageSize = 20,
    pageToken = '',
    language = getApiLanguage()
} = {}) {
    const body = {
        language, filter, pageSize, pageToken,
    };
    if (orderBy) body.orderBy = orderBy;
    return apiPost('/deltaforceapi.gateway.v1.ApiService/ListAuctionItems', body);
}

export async function getAuctionItem(id, language = getApiLanguage()) {
    return apiPost('/deltaforceapi.gateway.v1.ApiService/GetAuctionItem', { id, language });
}

export async function getAuctionItemPrices(auctionItemId, { pageSize = 20, pageToken = '', orderBy = '', startTime = '', endTime = '', language = getApiLanguage() } = {}) {
    const body = { auctionItemId, pageSize, pageToken, language };
    if (orderBy) body.orderBy = orderBy;
    if (startTime) body.startTime = startTime;
    if (endTime) body.endTime = endTime;
    return apiPost('/deltaforceapi.gateway.v1.ApiService/GetAuctionItemPrices', body);
}

export async function getAuctionItemPriceSeries(auctionItemId, { startTime = '', endTime = '', interval = '', language = getApiLanguage() } = {}) {
    return apiPost('/deltaforceapi.gateway.v1.ApiService/GetAuctionItemPriceSeries', {
        auctionItemId, startTime, endTime, interval, language
    });
}

export async function getAuctionItemReferencePriceSeries(auctionItemId, { startTime = '', endTime = '', interval = '' } = {}) {
    return apiPost('/deltaforceapi.gateway.v1.ApiService/GetAuctionItemReferencePriceSeries', {
        auctionItemId, startTime, endTime, interval,
    });
}

// ─── Players ─────────────────────────────────────────────

/**
 * Get player info — use deltaForceId (the long number) or id (UUID)
 */
export async function getPlayer({ id = '', deltaForceId = '', name = '' } = {}) {
    const body = {};
    if (id) body.id = id;
    if (deltaForceId) body.deltaForceId = deltaForceId;
    if (name) body.name = name;
    return apiPost('/deltaforceapi.gateway.v1.ApiService/GetPlayer', body);
}

/**
 * Get player operation stats — MUST use playerId (UUID), not id
 */
export async function getPlayerOperationStats(playerId, { seasonId = '', ranked = false } = {}) {
    const body = { playerId };
    if (seasonId) body.seasonId = seasonId;
    if (ranked) body.ranked = ranked;
    return apiPost('/deltaforceapi.gateway.v1.ApiService/GetPlayerOperationStats', body);
}

/**
 * Get player stash value — MUST use playerId (UUID)
 */
export async function getPlayerOperationStashValue(playerId) {
    return apiPost('/deltaforceapi.gateway.v1.ApiService/GetPlayerOperationStashValue', { playerId });
}

/**
 * Get player historical stash value — MUST use playerId (UUID) + startTime/endTime
 */
export async function getPlayerOperationHistoricalStashValue(playerId, { startTime = '', endTime = '', pageSize = 20, pageToken = '' } = {}) {
    const body = { playerId, pageSize, pageToken };
    if (startTime) body.startTime = startTime;
    if (endTime) body.endTime = endTime;
    return apiPost('/deltaforceapi.gateway.v1.ApiService/GetPlayerOperationHistoricalStashValue', body);
}

// ─── Seasons ─────────────────────────────────────────────

export async function listSeasons({ pageSize = 50, pageToken = '', language = getApiLanguage() } = {}) {
    return apiPost('/deltaforceapi.gateway.v1.ApiService/ListSeasons', {
        language, pageSize, pageToken,
    });
}
