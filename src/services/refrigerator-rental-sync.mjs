import { normalizeBoothCode, splitBoothCodeList } from '../utils/booth-map.mjs';
import { getChinaTimestamp } from '../utils/helpers.mjs';

const SQL_IN_CHUNK_SIZE = 80;
const RENTAL_MODE_BOOTH = 'booth';

function chunkItems(items = [], chunkSize = SQL_IN_CHUNK_SIZE) {
    const output = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        output.push(items.slice(index, index + chunkSize));
    }
    return output;
}

function isMissingTableError(error) {
    return /no such table/i.test(String(error?.message || ''));
}

function normalizeBoothList(value) {
    return splitBoothCodeList(value)
        .map((boothCode) => normalizeBoothCode(boothCode))
        .filter(Boolean);
}

function isSameBoothList(leftValue, rightValue) {
    const left = normalizeBoothList(leftValue);
    const right = normalizeBoothList(rightValue);
    if (left.length === 0 || left.length !== right.length) return false;
    return left.every((boothCode, index) => boothCode === right[index]);
}

function normalizeRentalMode(value) {
    return String(value || '').trim() || RENTAL_MODE_BOOTH;
}

async function getBoothHallMap(env, projectId, boothCodes = []) {
    const normalizedCodes = Array.from(new Set((Array.isArray(boothCodes) ? boothCodes : [])
        .map((boothCode) => normalizeBoothCode(boothCode))
        .filter(Boolean)));
    const boothHallMap = new Map();
    for (const chunk of chunkItems(normalizedCodes)) {
        const placeholders = chunk.map(() => '?').join(',');
        const rows = ((await env.DB.prepare(`
          SELECT id, hall
          FROM Booths
          WHERE project_id = ?
            AND id IN (${placeholders})
        `).bind(Number(projectId || 0), ...chunk).all()).results || []);
        rows.forEach((row) => {
            boothHallMap.set(normalizeBoothCode(row.id), String(row.hall || '').trim());
        });
    }
    return boothHallMap;
}

async function buildSystemBoothSnapshot(env, projectId, companyName) {
    const rows = ((await env.DB.prepare(`
      SELECT booth_id
      FROM Orders
      WHERE project_id = ?
        AND company_name = ?
        AND status = '正常'
        AND (deleted_at IS NULL OR deleted_at = '')
      ORDER BY datetime(created_at) DESC, id DESC
    `).bind(Number(projectId || 0), String(companyName || '').trim()).all()).results || []);

    const boothCodes = [];
    const seenBoothCodes = new Set();
    rows.forEach((row) => {
        normalizeBoothList(row.booth_id).forEach((boothCode) => {
            if (seenBoothCodes.has(boothCode)) return;
            seenBoothCodes.add(boothCode);
            boothCodes.push(boothCode);
        });
    });
    const boothHallMap = await getBoothHallMap(env, projectId, boothCodes);
    const hallNames = [];
    const seenHallNames = new Set();
    boothCodes.forEach((boothCode) => {
        const hallName = boothHallMap.get(boothCode);
        if (!hallName || seenHallNames.has(hallName)) return;
        seenHallNames.add(hallName);
        hallNames.push(hallName);
    });
    return {
        booth_numbers: boothCodes.join(', '),
        hall_names: hallNames.join('，')
    };
}

export async function prepareRefrigeratorRentalBoothSnapshotSync(env, projectId, companyName) {
    const normalizedProjectId = Number(projectId || 0);
    const normalizedCompanyName = String(companyName || '').trim();
    if (!normalizedProjectId || !normalizedCompanyName) return { active: false };
    try {
        const rentals = ((await env.DB.prepare(`
          SELECT id, booth_numbers, hall_names
          FROM ExhibitionRefrigeratorRentals
          WHERE project_id = ?
            AND company_name = ?
            AND COALESCE(rental_mode, ?) = ?
        `).bind(normalizedProjectId, normalizedCompanyName, RENTAL_MODE_BOOTH, RENTAL_MODE_BOOTH).all()).results || []);
        if (rentals.length === 0) return { active: false };
        const previousSnapshot = await buildSystemBoothSnapshot(env, normalizedProjectId, normalizedCompanyName);
        return {
            active: true,
            projectId: normalizedProjectId,
            companyName: normalizedCompanyName,
            rentals,
            previousSnapshot
        };
    } catch (error) {
        if (isMissingTableError(error)) return { active: false };
        throw error;
    }
}

export async function applyRefrigeratorRentalBoothSnapshotSync(env, syncContext) {
    if (!syncContext?.active) return { updated_count: 0 };
    const nextSnapshot = await buildSystemBoothSnapshot(env, syncContext.projectId, syncContext.companyName);
    let updatedCount = 0;
    for (const rental of syncContext.rentals || []) {
        if (!isSameBoothList(rental.booth_numbers, syncContext.previousSnapshot?.booth_numbers)) continue;
        if (isSameBoothList(rental.booth_numbers, nextSnapshot.booth_numbers)) continue;
        await env.DB.prepare(`
          UPDATE ExhibitionRefrigeratorRentals
          SET hall_names = ?,
              booth_numbers = ?,
              usage_location = '',
              updated_at = ?
          WHERE id = ?
            AND project_id = ?
            AND COALESCE(rental_mode, ?) = ?
        `).bind(
            nextSnapshot.hall_names,
            nextSnapshot.booth_numbers,
            getChinaTimestamp(),
            Number(rental.id || 0),
            syncContext.projectId,
            RENTAL_MODE_BOOTH,
            RENTAL_MODE_BOOTH
        ).run();
        updatedCount += 1;
    }
    return { updated_count: updatedCount };
}

export async function syncRefrigeratorRentalBoothSnapshotsForRentals(env, projectId, rentals = []) {
    const normalizedProjectId = Number(projectId || 0);
    const normalizedRentals = Array.isArray(rentals) ? rentals : [];
    if (!normalizedProjectId || normalizedRentals.length === 0) {
        return { rentals: normalizedRentals, updated_count: 0 };
    }

    const companyNames = Array.from(new Set(normalizedRentals
        .filter((rental) => normalizeRentalMode(rental?.rental_mode) === RENTAL_MODE_BOOTH)
        .map((rental) => String(rental?.company_name || '').trim())
        .filter(Boolean)));
    if (companyNames.length === 0) return { rentals: normalizedRentals, updated_count: 0 };

    const snapshotMap = new Map();
    for (const companyName of companyNames) {
        const snapshot = await buildSystemBoothSnapshot(env, normalizedProjectId, companyName);
        if (snapshot.booth_numbers) snapshotMap.set(companyName, snapshot);
    }
    if (snapshotMap.size === 0) return { rentals: normalizedRentals, updated_count: 0 };

    const nowText = getChinaTimestamp();
    let updatedCount = 0;
    const nextRentals = [];
    for (const rental of normalizedRentals) {
        const companyName = String(rental?.company_name || '').trim();
        const snapshot = snapshotMap.get(companyName);
        if (
            snapshot
            && normalizeRentalMode(rental?.rental_mode) === RENTAL_MODE_BOOTH
            && Number(rental?.id || 0) > 0
            && (
                !isSameBoothList(rental.booth_numbers, snapshot.booth_numbers)
                || String(rental.hall_names || '').trim() !== String(snapshot.hall_names || '').trim()
                || String(rental.usage_location || '').trim()
            )
        ) {
            await env.DB.prepare(`
              UPDATE ExhibitionRefrigeratorRentals
              SET hall_names = ?,
                  booth_numbers = ?,
                  usage_location = '',
                  updated_at = ?
              WHERE id = ?
                AND project_id = ?
                AND COALESCE(rental_mode, ?) = ?
            `).bind(
                snapshot.hall_names,
                snapshot.booth_numbers,
                nowText,
                Number(rental.id || 0),
                normalizedProjectId,
                RENTAL_MODE_BOOTH,
                RENTAL_MODE_BOOTH
            ).run();
            updatedCount += 1;
            nextRentals.push({
                ...rental,
                hall_names: snapshot.hall_names,
                booth_numbers: snapshot.booth_numbers,
                usage_location: '',
                updated_at: nowText
            });
        } else {
            nextRentals.push(rental);
        }
    }

    return { rentals: nextRentals, updated_count: updatedCount };
}
