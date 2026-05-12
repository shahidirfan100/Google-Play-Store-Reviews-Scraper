import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';

const PLAY_BASE = 'https://play.google.com';
const PLAY_DETAILS = `${PLAY_BASE}/store/apps/details`;
const REVIEWS_RPC = 'UsvDTd';
const SORT_MAP = {
    helpfulness: 1,
    newest: 2,
    rating: 3,
};

function toPositiveInt(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(1, Math.floor(numeric));
}

function unixPartsToIso(timestampParts) {
    if (!Array.isArray(timestampParts) || timestampParts.length < 1) return null;
    const seconds = Number(timestampParts[0]);
    const nanos = Number(timestampParts[1] || 0);
    if (!Number.isFinite(seconds)) return null;
    const millis = (seconds * 1000) + Math.floor(nanos / 1e6);
    return new Date(millis).toISOString();
}

function sanitizeValue(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }
    if (Array.isArray(value)) {
        const cleaned = value.map((item) => sanitizeValue(item)).filter((item) => item !== undefined);
        return cleaned.length ? cleaned : undefined;
    }
    if (typeof value === 'object') {
        const cleanedEntries = Object.entries(value)
            .map(([key, val]) => [key, sanitizeValue(val)])
            .filter(([, val]) => val !== undefined);
        if (!cleanedEntries.length) return undefined;
        return Object.fromEntries(cleanedEntries);
    }
    return value;
}

function sanitizeRecord(record) {
    return sanitizeValue(record) || {};
}

function readStringInput(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function firstDefinedValue(...values) {
    for (const value of values) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) return trimmed;
            continue;
        }
        if (value !== undefined && value !== null) return value;
    }
    return undefined;
}

function getRuntimeInputValue(input, schemaFallback, inputFallback, names) {
    return firstDefinedValue(
        ...names.map((name) => input[name]),
        ...names.map((name) => schemaFallback[name]),
        ...names.map((name) => inputFallback[name]),
    );
}

async function readJsonFileSafe(filePath) {
    try {
        const raw = await readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        log.warning(`Could not read ${filePath}: ${error.message}`);
        return {};
    }
}

async function loadSchemaFallback() {
    const schemaPath = path.join(process.cwd(), '.actor', 'input_schema.json');
    const schema = await readJsonFileSafe(schemaPath);
    const properties = schema?.properties;
    if (!properties || typeof properties !== 'object') return {};

    const fallback = {};
    for (const [key, config] of Object.entries(properties)) {
        if (!config || typeof config !== 'object') continue;
        if (config.prefill !== undefined) {
            fallback[key] = config.prefill;
            continue;
        }
        if (config.default !== undefined) fallback[key] = config.default;
    }

    return fallback;
}

async function loadInputJsonFallback() {
    const inputPath = path.join(process.cwd(), 'INPUT.json');
    return readJsonFileSafe(inputPath);
}

function extractAppIdFromUrlOrString(value) {
    if (!value || typeof value !== 'string') return null;
    let candidate = value.trim();
    if (!candidate) return null;

    candidate = candidate.replace(/&amp;/g, '&');

    // Auto-heal encoded links pasted from wrappers or redirect URLs.
    for (let i = 0; i < 3; i++) {
        try {
            const decoded = decodeURIComponent(candidate);
            if (decoded === candidate) break;
            candidate = decoded;
        } catch {
            break;
        }
    }

    const directPackageMatch = candidate.match(/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+$/);
    if (directPackageMatch) return directPackageMatch[0];

    const urlCandidates = [candidate];
    if (/^play\.google\.com\//i.test(candidate)) urlCandidates.push(`https://${candidate}`);

    for (const urlCandidate of urlCandidates) {
        try {
            const parsedUrl = new URL(urlCandidate);
            for (const [key, paramValue] of parsedUrl.searchParams.entries()) {
                if (key.toLowerCase() !== 'id') continue;
                const idCandidate = readStringInput(paramValue);
                if (idCandidate.match(/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+$/)) return idCandidate;
            }
        } catch {
            // noop
        }
    }

    const idQueryMatch = candidate.match(/[?&]id=([a-zA-Z0-9._-]+)/i) || candidate.match(/\bid=([a-zA-Z0-9._-]+)/i);
    if (idQueryMatch?.[1]) return idQueryMatch[1];

    const inlinePackageMatch = candidate.match(/\b([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)\b/);
    return inlinePackageMatch?.[1] || null;
}

async function getProxyUrl(proxyConfiguration) {
    if (!proxyConfiguration) return undefined;
    return proxyConfiguration.newUrl();
}

async function requestText({ url, method = 'GET', headers = {}, body, proxyConfiguration }) {
    const proxyUrl = await getProxyUrl(proxyConfiguration);
    const response = await gotScraping({
        url,
        method,
        headers,
        body,
        proxyUrl,
        retry: {
            limit: 3,
            methods: ['GET', 'POST'],
            statusCodes: [408, 413, 429, 500, 502, 503, 504],
        },
        timeout: {
            request: 45000,
        },
        throwHttpErrors: false,
    });

    if (response.statusCode >= 400) {
        throw new Error(`HTTP ${response.statusCode} for ${url}`);
    }
    return response.body;
}

async function resolveAppIdFromKeyword({ keyword, lang, country, proxyConfiguration }) {
    const searchUrl = `${PLAY_BASE}/store/search?q=${encodeURIComponent(keyword)}&c=apps&hl=${encodeURIComponent(lang)}&gl=${encodeURIComponent(country)}`;
    const html = await requestText({
        url: searchUrl,
        headers: {
            'accept-language': `${lang},en-US;q=0.9,en;q=0.8`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
        },
        proxyConfiguration,
    });

    const regex = /\/store\/apps\/details\?id(?:=|\\u003d)([a-zA-Z0-9._-]+)/g;
    const appIds = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        const appId = match[1];
        if (!appIds.includes(appId)) appIds.push(appId);
    }

    if (!appIds.length) {
        throw new Error(`No app found for keyword "${keyword}".`);
    }

    return appIds[0];
}

function buildReviewsPayload({ appId, sortCode, pageSize, continuationToken }) {
    const pageConfig = continuationToken
        ? [pageSize, null, continuationToken]
        : [pageSize, null, null];

    return [null, null, [2, sortCode, pageConfig, null, []], [appId, 7]];
}

function parseBatchExecuteResponse(body) {
    const payloadStart = body.indexOf('\n');
    if (payloadStart === -1) throw new Error('Unexpected batchexecute response format.');

    const parsedTop = JSON.parse(body.substring(payloadStart + 1));
    const wrbEntry = Array.isArray(parsedTop?.[0])
        ? parsedTop[0].find((entry) => Array.isArray(entry) && entry[0] === 'wrb.fr' && typeof entry[2] === 'string')
        : null;

    if (!wrbEntry) throw new Error('Could not locate review payload in batchexecute response.');

    const parsedPayload = JSON.parse(wrbEntry[2]);
    const reviews = Array.isArray(parsedPayload?.[0]) ? parsedPayload[0] : [];
    const nextToken = typeof parsedPayload?.[1]?.[1] === 'string' ? parsedPayload[1][1] : null;
    return { reviews, nextToken };
}

async function fetchReviewsPage({ appId, lang, country, sortCode, pageSize, continuationToken, proxyConfiguration }) {
    const requestPayload = buildReviewsPayload({ appId, sortCode, pageSize, continuationToken });
    const fReq = JSON.stringify([
        [
            [
                REVIEWS_RPC,
                JSON.stringify(requestPayload),
                null,
                'generic',
            ],
        ],
    ]);
    const requestBody = new URLSearchParams({ 'f.req': fReq }).toString();

    const endpoint = `${PLAY_BASE}/_/PlayStoreUi/data/batchexecute?rpcids=${REVIEWS_RPC}&hl=${encodeURIComponent(lang)}&gl=${encodeURIComponent(country)}&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213&rt=j`;
    const referer = `${PLAY_DETAILS}?id=${encodeURIComponent(appId)}&hl=${encodeURIComponent(lang)}&gl=${encodeURIComponent(country)}`;
    const responseBody = await requestText({
        url: endpoint,
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            origin: PLAY_BASE,
            referer,
            'accept-language': `${lang},en-US;q=0.9,en;q=0.8`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
        },
        body: requestBody,
        proxyConfiguration,
    });

    return parseBatchExecuteResponse(responseBody);
}

function mapReview(rawReview, { appId, lang, country, sort, sourceUrl, sourceKeyword }) {
    const reviewId = rawReview?.[0];
    const reviewer = rawReview?.[1] || [];
    const userName = reviewer?.[0];
    const userImage = reviewer?.[1]?.[3]?.[2];
    const criteriaRatingsRaw = rawReview?.[12]?.[0];
    const criteriaRatings = Array.isArray(criteriaRatingsRaw)
        ? criteriaRatingsRaw.map((criteria) => ({
            criteria: criteria?.[0],
            rating: criteria?.[1]?.[0],
        }))
        : undefined;

    const mapped = {
        appId,
        appUrl: `${PLAY_DETAILS}?id=${appId}`,
        reviewId,
        reviewUrl: reviewId ? `${PLAY_DETAILS}?id=${appId}&reviewId=${reviewId}` : undefined,
        userName,
        userImage,
        reviewerId: rawReview?.[9]?.[0],
        score: rawReview?.[2],
        scoreText: Number.isFinite(rawReview?.[2]) ? String(rawReview[2]) : undefined,
        text: rawReview?.[4],
        thumbsUpCount: rawReview?.[6],
        reviewCreatedVersion: rawReview?.[10],
        at: unixPartsToIso(rawReview?.[5]),
        replyAuthorName: rawReview?.[7]?.[0],
        replyText: rawReview?.[7]?.[1],
        repliedAt: unixPartsToIso(rawReview?.[7]?.[2]),
        criteriaRatings,
        lang,
        country,
        sort,
        sourceUrl,
        sourceKeyword,
    };

    return sanitizeRecord(mapped);
}

async function main() {
    const input = (await Actor.getInput()) || {};
    const schemaFallback = await loadSchemaFallback();
    const inputFallback = await loadInputJsonFallback();

    const url = getRuntimeInputValue(input, schemaFallback, inputFallback, ['url']);
    const keyword = getRuntimeInputValue(input, schemaFallback, inputFallback, ['keyword']);
    const resultsWantedInput = getRuntimeInputValue(input, schemaFallback, inputFallback, ['results_wanted', 'resultsWanted']);
    const maxPagesInput = getRuntimeInputValue(input, schemaFallback, inputFallback, ['max_pages', 'maxPages']);
    const sortInput = getRuntimeInputValue(input, schemaFallback, inputFallback, ['sort']);
    const langInput = getRuntimeInputValue(input, schemaFallback, inputFallback, ['lang']);
    const countryInput = getRuntimeInputValue(input, schemaFallback, inputFallback, ['country']);
    const proxyConfigurationInput = getRuntimeInputValue(input, schemaFallback, inputFallback, ['proxyConfiguration']);

    const totalWanted = toPositiveInt(resultsWantedInput, 20);
    const maxPages = toPositiveInt(maxPagesInput, 10);
    const normalizedSort = String(sortInput || 'newest').toLowerCase();
    const sortCode = SORT_MAP[normalizedSort] || SORT_MAP.newest;
    const normalizedLang = readStringInput(langInput) || 'en';
    const normalizedCountry = readStringInput(countryInput) || 'us';

    const proxyConf = proxyConfigurationInput ? await Actor.createProxyConfiguration(proxyConfigurationInput) : undefined;
    const appIdFromDirectInput = extractAppIdFromUrlOrString(url || '');
    const appId = appIdFromDirectInput || (keyword ? await resolveAppIdFromKeyword({
        keyword: readStringInput(keyword),
        lang: normalizedLang,
        country: normalizedCountry,
        proxyConfiguration: proxyConf,
    }) : null);

    if (!appId) {
        throw new Error('Provide a valid Play Store app URL/package ID in "url" or provide a "keyword".');
    }

    log.info(`Resolved appId: ${appId}`);

    const seenReviewIds = new Set();
    let savedCount = 0;
    let page = 1;
    let continuationToken = null;

    while (savedCount < totalWanted && page <= maxPages) {
        const pageSize = Math.min(150, totalWanted - savedCount);
        log.info(`Fetching reviews page ${page}/${maxPages} (target page size: ${pageSize})`);

        const { reviews, nextToken } = await fetchReviewsPage({
            appId,
            lang: normalizedLang,
            country: normalizedCountry,
            sortCode,
            pageSize,
            continuationToken,
            proxyConfiguration: proxyConf,
        });

        if (!reviews.length) {
            log.info('No reviews returned from API; stopping pagination.');
            break;
        }

        const recordsToPush = [];
        for (const rawReview of reviews) {
            const reviewId = rawReview?.[0];
            if (reviewId && seenReviewIds.has(reviewId)) continue;
            if (reviewId) seenReviewIds.add(reviewId);

            const mapped = mapReview(rawReview, {
                appId,
                lang: normalizedLang,
                country: normalizedCountry,
                sort: normalizedSort,
                sourceUrl: typeof url === 'string' ? url : undefined,
                sourceKeyword: typeof keyword === 'string' ? keyword : undefined,
            });

            if (Object.keys(mapped).length) recordsToPush.push(mapped);
            if ((savedCount + recordsToPush.length) >= totalWanted) break;
        }

        if (!recordsToPush.length) {
            log.warning('Page returned only duplicate/empty records; stopping to avoid loop.');
            break;
        }

        await Dataset.pushData(recordsToPush);
        savedCount += recordsToPush.length;
        log.info(`Saved ${recordsToPush.length} reviews from page ${page}. Total saved: ${savedCount}/${totalWanted}`);

        if (!nextToken) {
            log.info('No continuation token returned; reached last available page.');
            break;
        }

        continuationToken = nextToken;
        page++;
    }

    log.info(`Finished. App: ${appId}, saved reviews: ${savedCount}`);
}

await Actor.main(main);
