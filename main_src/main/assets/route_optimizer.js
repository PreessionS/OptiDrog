// =====================================================
// KOMPLETNY SKRYPT OPTYMALIZACJI TRAS
// WERSJA 6.3 - POPRAWIONA OBSŁUGA OKIEN CZASOWYCH
// =====================================================
//
// ALGORYTM "PO SZNURKU":
// 1. Punkty FIRST zawsze na początku (po punkcie startowym)
// 2. Punkty RETURN zawsze na końcu (przed punktem końcowym)
// 3. Punkty z oknami czasowymi sortowane według slotów czasowych
// 4. Punkty blisko siebie grupowane i odwiedzane sekwencyjnie
// 5. Wewnątrz grupy: sortowanie wzdłuż osi ulicy
// 6. Brak skoków między odległymi punktami
// 7. Start od najbliższego punktu (gdy brak FIRST)
// 8. POPRAWKA: Optymalizacja uwzględnia okna czasowe
//
// =====================================================

// =====================================================
// KONFIGURACJA
// =====================================================

const API_BASE_URL = 'https://optidrog.pl/api';
const API_KEY = '';
const API_TIMEOUT = 120000;

// Tolerancja czasowa (minuty)
const TIME_TOLERANCE_BEFORE = 15;  // Można przyjechać 15 min przed timeFrom
const TIME_TOLERANCE_AFTER = 15;   // Można przyjechać 15 min po timeTo

// Grupowanie bliskości
const PROXIMITY_THRESHOLD_METERS = 200;      // Punkty bliżej = ta sama grupa
const STREET_GROUP_THRESHOLD_METERS = 500;   // Max rozpiętość grupy
const DENSE_AREA_THRESHOLD_METERS = 100;     // Bardzo gęsty obszar

// Płynność trasy
const MAX_REASONABLE_JUMP_METERS = 3000;     // Max "rozsądny" skok (3km)
const JUMP_PENALTY_MULTIPLIER = 1.5;         // Mnożnik kary za skoki

// Wydajność
const OPTIMIZATION_TIME_LIMIT = 30000;       // Max 30 sekund na optymalizację
const SPATIAL_HASH_THRESHOLD = 50;           // Użyj spatial hash dla >50 punktów

// Start od najbliższego punktu
const DEFAULT_START_FROM_NEAREST = true;     // Domyślnie zaczynaj od najbliższego

// Minimalny czas obsługi na punkcie (minuty) - nawet gdy stopTimeMinutes = 0
const MIN_SERVICE_TIME_MINUTES = 3;

let lastUsedProvider = 'unknown';

/**
 * Oblicza czas obsługi punktu (deterministyczny, bazujący na adresie i indeksie)
 * @param {string} address - Adres punktu
 * @param {number} baseMinutes - Bazowy czas obsługi w minutach
 * @param {number} pointIndex - Indeks punktu w trasie (opcjonalny, dla lepszej wariacji)
 * @returns {number} - Czas obsługi w minutach (minimum MIN_SERVICE_TIME_MINUTES)
 */
function getVariableStopTime(address, baseMinutes, pointIndex = 0) {
    // Hash z adresu + indeks dla deterministycznej wariacji
    let hash = pointIndex * 7919;
    for (let i = 0; i < address.length; i++) {
        hash = ((hash << 5) - hash) + address.charCodeAt(i);
        hash = hash & hash;
    }
    // Wariacja 0-3 minuty dodatkowe
    const variation = (Math.abs(hash) % 100) / 100;
    const extraMinutes = variation * 3;
    // Minimum MIN_SERVICE_TIME_MINUTES nawet gdy baseMinutes = 0
    return Math.max(MIN_SERVICE_TIME_MINUTES, baseMinutes) + extraMinutes;
}

// =====================================================
// CACHE DLA WYDAJNOŚCI
// =====================================================

const timeWindowCache = new WeakMap();
const streetNameCache = new WeakMap();

// =====================================================
// KOMUNIKACJA Z SERWEREM
// =====================================================

function showAndroidNotification(message, type = 'info') {
    if (typeof Android !== 'undefined' && Android.showToast) {
        Android.showToast(message);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

async function getMatrixFromServer(locations) {
    const url = `${API_BASE_URL}/matrix.php`;

    const requestBody = {
        locations: locations.map(loc => ({
            lat: loc.lat,
            lng: loc.lng
        }))
    };

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    if (API_KEY) {
        headers['X-API-Key'] = API_KEY;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        console.log(`📡 Wysyłam ${locations.length} lokalizacji do serwera...`);
        showAndroidNotification(`Pobieranie macierzy dla ${locations.length} punktów...`);

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Serwer HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Nieznany błąd serwera');
        }

        lastUsedProvider = data.provider || 'server';
        console.log(`✅ Otrzymano macierz z serwera (provider: ${lastUsedProvider})`);

        return {
            distances: data.distances,
            durations: data.durations,
            provider: data.provider
        };

    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Timeout - serwer nie odpowiedział w ciągu 2 minut');
        }
        console.error('Błąd połączenia z serwerem:', error);
        showAndroidNotification(`Błąd serwera: ${error.message}`, 'error');
        throw error;
    }
}

async function checkMatrixProviders() {
    const url = `${API_BASE_URL}/matrix.php?action=status`;
    const headers = { 'Accept': 'application/json' };
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    try {
        const response = await fetch(url, { method: 'GET', headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Błąd sprawdzania statusu:', error);
        throw error;
    }
}

async function resetMatrixProvider() {
    const url = `${API_BASE_URL}/matrix.php?action=reset`;
    const headers = { 'Accept': 'application/json' };
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    try {
        const response = await fetch(url, { method: 'GET', headers });
        const data = await response.json();
        console.log('Provider zresetowany:', data);
        showAndroidNotification('Provider zresetowany do OSRM');
        return data;
    } catch (error) {
        console.error('Błąd resetu providera:', error);
        throw error;
    }
}

async function getCompleteMatrix(locations) {
    return await getMatrixFromServer(locations);
}

// =====================================================
// FUNKCJE GEOMETRYCZNE
// =====================================================

/**
 * Oblicza odległość geograficzną między dwoma punktami (metry)
 * Używa formuły Haversine
 */
function getGeographicDistance(point1, point2) {
    const R = 6371000; // Promień Ziemi w metrach
    const lat1 = point1.lat * Math.PI / 180;
    const lat2 = point2.lat * Math.PI / 180;
    const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Pobiera odległość między punktami (z macierzy lub geograficzną)
 */
function getDistanceBetween(p1, p2, distances, locMap) {
    const idx1 = locMap.get(p1);
    const idx2 = locMap.get(p2);

    if (idx1 !== undefined && idx2 !== undefined) {
        return distances[idx1][idx2];
    }
    return getGeographicDistance(p1, p2);
}

/**
 * Oblicza całkowity dystans trasy
 */
function calcRouteDist(route, distances, locMap) {
    let total = 0;
    for (let i = 0; i < route.length - 1; i++) {
        total += getDistanceBetween(route[i], route[i + 1], distances, locMap);
    }
    return total;
}

/**
 * Sprawdza czy dwa odcinki się przecinają
 */
function segmentsIntersect(p1, p2, p3, p4) {
    const ccw = (A, B, C) => {
        return (C.lat - A.lat) * (B.lng - A.lng) > (B.lat - A.lat) * (C.lng - A.lng);
    };
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

/**
 * Oblicza centroid (środek geometryczny) grupy punktów
 */
function calculateCentroid(points) {
    if (points.length === 0) return null;
    return {
        lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
        lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length
    };
}

/**
 * Znajduje najbliższy punkt do podanego punktu
 */
function findNearestPoint(fromPoint, points, distances, locMap) {
    if (points.length === 0) return null;
    if (points.length === 1) return { point: points[0], index: 0, distance: 0 };

    let nearestIdx = 0;
    let minDist = Infinity;

    for (let i = 0; i < points.length; i++) {
        const dist = getDistanceBetween(fromPoint, points[i], distances, locMap);
        if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
        }
    }

    return {
        point: points[nearestIdx],
        index: nearestIdx,
        distance: minDist
    };
}

// =====================================================
// PARSOWANIE OKIEN CZASOWYCH
// =====================================================

/**
 * Parsuje okno czasowe punktu z cache'owaniem
 *
 * POPRAWKA v6.3: Lepsze targetMinutes z uwzględnieniem tolerancji
 *
 * Obsługuje:
 * - timeFrom + timeTo: pełne okno, cel = środek okna
 * - tylko timeFrom: cel = tuż po otwarciu + bufor tolerancji
 * - tylko timeTo: cel = przed deadline - bufor tolerancji - zapas
 * - brak okna: punkt elastyczny
 */
function parseTimeWindow(point) {
    // Sprawdź cache
    if (timeWindowCache.has(point)) {
        return timeWindowCache.get(point);
    }

    const result = {
        hasWindow: false,
        hasFrom: false,
        hasTo: false,
        fromMinutes: 0,
        toMinutes: 24 * 60,
        targetMinutes: null,  // Optymalny czas przyjazdu
        urgency: 0            // 0-10, im wyższe tym ważniejsze
    };

    if (point.timeFrom) {
        const parts = point.timeFrom.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1] || '0', 10);
        result.fromMinutes = h * 60 + m;
        result.hasFrom = true;
        result.hasWindow = true;
    }

    if (point.timeTo) {
        const parts = point.timeTo.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1] || '0', 10);
        result.toMinutes = h * 60 + m;
        result.hasTo = true;
        result.hasWindow = true;
    }

    if (result.hasWindow) {
        if (result.hasFrom && result.hasTo) {
            // Pełne okno: cel = środek okna (najbezpieczniejsze)
            result.targetMinutes = (result.fromMinutes + result.toMinutes) / 2;
            // Urgency zależy od szerokości okna (wąskie = pilne)
            const windowWidth = result.toMinutes - result.fromMinutes;
            result.urgency = windowWidth < 60 ? 10 : windowWidth < 120 ? 7 : 4;
        } else if (result.hasFrom) {
            // Tylko "od": cel = zaraz po otwarciu + połowa buforu tolerancji
            // Nie za wcześnie (tolerancja -15), nie za późno
            result.targetMinutes = result.fromMinutes + Math.floor(TIME_TOLERANCE_BEFORE / 2);
            result.urgency = 6;
        } else {
            // Tylko "do": cel = przed deadline - tolerancja - dodatkowy zapas
            // WAŻNE: Deadline jest najważniejszy, więc zostawiamy duży bufor
            result.targetMinutes = result.toMinutes - TIME_TOLERANCE_AFTER - 10;
            result.urgency = 9; // Wyższa urgency - deadline!
        }
    }

    // Zapisz w cache
    timeWindowCache.set(point, result);
    return result;
}

/**
 * Sprawdza czy przyjazd mieści się w oknie z tolerancją
 */
function isWithinTimeWindow(arrivalMinutes, point, toleranceBefore = TIME_TOLERANCE_BEFORE, toleranceAfter = TIME_TOLERANCE_AFTER) {
    const tw = parseTimeWindow(point);

    if (!tw.hasWindow) {
        return { valid: true, delay: 0, early: 0 };
    }

    const effectiveFrom = tw.fromMinutes - toleranceBefore;
    const effectiveTo = tw.toMinutes + toleranceAfter;

    let early = 0;
    let delay = 0;
    let valid = true;

    if (arrivalMinutes < effectiveFrom) {
        early = effectiveFrom - arrivalMinutes;
        valid = false;
    } else if (arrivalMinutes > effectiveTo) {
        delay = arrivalMinutes - effectiveTo;
        valid = false;
    }

    return { valid, delay, early, effectiveFrom, effectiveTo };
}

/**
 * NOWA FUNKCJA: Oblicza koszt odchylenia od okna czasowego
 * Uwzględnia zarówno przekroczenia jak i odległość od targetu
 */
function calculateTimeWindowCost(arrivalMin, point, weight = 1.0) {
    const tw = parseTimeWindow(point);

    if (!tw.hasWindow) {
        return 0;
    }

    // Sprawdź czy w oknie z tolerancją
    const effectiveFrom = tw.fromMinutes - TIME_TOLERANCE_BEFORE;
    const effectiveTo = tw.toMinutes + TIME_TOLERANCE_AFTER;

    let cost = 0;

    // Koszt za wyjście poza okno (kwadratowy - BARDZO DUŻE KARY w v6.4!)
    if (arrivalMin < effectiveFrom) {
        const earlyMinutes = effectiveFrom - arrivalMin;
        cost += earlyMinutes * earlyMinutes * 500 * weight; // Zwiększono ze 100 na 500
    } else if (arrivalMin > effectiveTo) {
        const lateMinutes = arrivalMin - effectiveTo;
        cost += lateMinutes * lateMinutes * 1000 * weight; // Zwiększono ze 150 na 1000 - spóźnienie jest krytyczne!
    }

    // Dodatkowy koszt za odległość od targetMinutes (nawet w oknie)
    // To powoduje że algorytm preferuje optymalne czasy, nie tylko "w oknie"
    if (tw.targetMinutes !== null) {
        const distanceFromTarget = Math.abs(arrivalMin - tw.targetMinutes);
        cost += distanceFromTarget * 20 * weight; // Zwiększono z 5 na 20
    }

    // Mnożnik urgency - ważniejsze punkty = większy koszt
    cost *= (1 + tw.urgency / 10);

    return cost;
}

/**
 * Pełna analiza okien czasowych dla całej trasy
 */
function analyzeTimeWindows(route, durations, locMap, startTime, stopTimeMinutes) {
    let cumTime = 0;
    let violations = 0;
    let totalDelay = 0;
    let totalEarly = 0;
    const details = [];

    for (let i = 0; i < route.length; i++) {
        const point = route[i];

        if (i > 0) {
            const prev = route[i - 1];
            const prevIdx = locMap.get(prev);
            const currIdx = locMap.get(point);
            if (prevIdx !== undefined && currIdx !== undefined) {
                cumTime += durations[prevIdx][currIdx];
            }
            if (i < route.length - 1) {
                // Użyj zmiennego czasu obsługi zamiast stałego
                const variableStopMinutes = getVariableStopTime(prev.address || '', stopTimeMinutes, i);
                cumTime += variableStopMinutes * 60;
            }
        }

        const arrivalTime = new Date(startTime.getTime() + cumTime * 1000);
        const arrivalMin = arrivalTime.getHours() * 60 + arrivalTime.getMinutes();

        const tw = parseTimeWindow(point);

        if (!tw.hasWindow) {
            details.push({
                point,
                index: i,
                arrivalMin,
                arrivalTime: formatTime(arrivalTime),
                status: 'no_window'
            });
            continue;
        }

        const check = isWithinTimeWindow(arrivalMin, point);

        if (!check.valid) {
            violations++;
            totalDelay += check.delay;
            totalEarly += check.early;
        }

        details.push({
            point,
            index: i,
            arrivalMin,
            arrivalTime: formatTime(arrivalTime),
            timeFrom: point.timeFrom || null,
            timeTo: point.timeTo || null,
            targetMin: tw.targetMinutes,
            urgency: tw.urgency,
            status: check.valid ? 'ok' : (check.delay > 0 ? 'late' : 'early'),
            delay: check.delay,
            early: check.early
        });
    }

    return {
        violations,
        totalDelay,
        totalEarly,
        details,
        penalty: violations * 1000 + totalDelay * 10 + totalEarly * 5
    };
}

function formatTime(date) {
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function formatMinutes(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// =====================================================
// WYCIĄGANIE NAZWY ULICY
// =====================================================

/**
 * Wyciąga nazwę ulicy z punktu (z cache'owaniem)
 */
function extractStreetName(point) {
    if (streetNameCache.has(point)) {
        return streetNameCache.get(point);
    }

    let result = null;

    if (point.street) {
        result = point.street;
    } else if (point.address) {
        const match = point.address.match(/^(?:ul\.\s*)?([^,\d]+)/i);
        if (match) result = match[1].trim();
    } else if (point.name) {
        const match = point.name.match(/^(?:ul\.\s*)?([^,\d]+)/i);
        if (match) result = match[1].trim();
    }

    streetNameCache.set(point, result);
    return result;
}

/**
 * Normalizuje nazwę ulicy do porównania
 */
function normalizeStreetName(street) {
    return street
        .toLowerCase()
        .replace(/^ul\.?\s*/i, '')
        .replace(/^ulica\s*/i, '')
        .replace(/^al\.?\s*/i, '')
        .replace(/^aleja\s*/i, '')
        .replace(/^pl\.?\s*/i, '')
        .replace(/^plac\s*/i, '')
        .replace(/^os\.?\s*/i, '')
        .replace(/^osiedle\s*/i, '')
        .trim();
}

/**
 * Wyciąga numer budynku z adresu
 */
function extractBuildingNumber(point) {
    const address = point.address || point.name || '';
    const match = address.match(/(\d+)\s*[a-zA-Z]?\s*(?:\/\d+)?/);
    if (match) {
        return parseInt(match[1], 10);
    }
    return null;
}

// =====================================================
// WYKRYWANIE GĘSTYCH OBSZARÓW
// =====================================================

/**
 * Sprawdza czy grupa punktów to "gęsty obszar"
 * Gęsty obszar = wiele punktów bardzo blisko siebie
 *
 * Optymalizacja: early exit + sampling dla dużych grup
 */
function isDenseArea(points) {
    if (points.length < 3) return false;

    // Dla dużych grup - użyj samplingowania
    if (points.length > 20) {
        return isDenseAreaSampled(points, 10);
    }

    // Dla małych grup - pełne sprawdzenie z early exit
    let closeCount = 0;
    const threshold = Math.floor((points.length * (points.length - 1)) / 4); // 25% par

    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            if (getGeographicDistance(points[i], points[j]) < DENSE_AREA_THRESHOLD_METERS) {
                closeCount++;
                if (closeCount >= threshold) return true; // Early exit
            }
        }
    }

    return false;
}

/**
 * Sprawdza gęstość na podstawie próbki punktów
 */
function isDenseAreaSampled(points, sampleSize) {
    const step = Math.max(1, Math.floor(points.length / sampleSize));
    const sample = [];

    for (let i = 0; i < points.length && sample.length < sampleSize; i += step) {
        sample.push(points[i]);
    }

    let closeCount = 0;
    const threshold = Math.floor(sample.length / 2);

    for (let i = 0; i < sample.length; i++) {
        for (let j = i + 1; j < sample.length; j++) {
            if (getGeographicDistance(sample[i], sample[j]) < DENSE_AREA_THRESHOLD_METERS) {
                closeCount++;
                if (closeCount >= threshold) return true;
            }
        }
    }

    return false;
}

// =====================================================
// GRUPOWANIE PUNKTÓW WEDŁUG BLISKOŚCI
// =====================================================

/**
 * Główna funkcja grupowania - wybiera algorytm w zależności od liczby punktów
 */
function groupPointsByProximity(points, thresholdMeters = PROXIMITY_THRESHOLD_METERS) {
    if (points.length === 0) return [];
    if (points.length === 1) return [points];

    // Dla małych zbiorów - prosta metoda O(n²)
    if (points.length <= SPATIAL_HASH_THRESHOLD) {
        return groupPointsByProximitySimple(points, thresholdMeters);
    }

    // Dla dużych zbiorów - spatial hashing O(n)
    return groupPointsBySpatialHash(points, thresholdMeters);
}

/**
 * Prosta metoda grupowania dla małych zbiorów
 * Grupuje punkty na tej samej ulicy lub blisko siebie
 */
function groupPointsByProximitySimple(points, thresholdMeters) {
    const groups = [];
    const assigned = new Set();

    // Sortuj - najpierw te z nazwą ulicy
    const sortedPoints = [...points].sort((a, b) => {
        const aStreet = extractStreetName(a);
        const bStreet = extractStreetName(b);
        if (aStreet && !bStreet) return -1;
        if (!aStreet && bStreet) return 1;
        return 0;
    });

    for (let i = 0; i < sortedPoints.length; i++) {
        if (assigned.has(i)) continue;

        const seedPoint = sortedPoints[i];
        const seedStreet = extractStreetName(seedPoint);
        const group = [seedPoint];
        assigned.add(i);

        for (let j = i + 1; j < sortedPoints.length; j++) {
            if (assigned.has(j)) continue;

            const candidate = sortedPoints[j];
            const candidateStreet = extractStreetName(candidate);

            // Sprawdź czy ta sama ulica
            const sameStreet = seedStreet && candidateStreet &&
                normalizeStreetName(seedStreet) === normalizeStreetName(candidateStreet);

            // Sprawdź odległość do punktu seed
            const distToSeed = getGeographicDistance(seedPoint, candidate);

            // Dodaj jeśli: ta sama ulica LUB blisko seed'a
            if ((sameStreet && distToSeed < STREET_GROUP_THRESHOLD_METERS) ||
                (!sameStreet && distToSeed < thresholdMeters)) {
                group.push(candidate);
                assigned.add(j);
            }
        }

        groups.push(group);
    }

    return groups;
}

/**
 * Spatial hashing dla dużych zbiorów - O(n) average
 * Dzieli przestrzeń na komórki i grupuje punkty z sąsiednich komórek
 */
function groupPointsBySpatialHash(points, thresholdMeters) {
    // Rozmiar komórki = threshold (w przybliżeniu stopnie)
    const cellSize = thresholdMeters / 111000;
    const grid = new Map();

    // Przypisz punkty do komórek
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const cellX = Math.floor(p.lng / cellSize);
        const cellY = Math.floor(p.lat / cellSize);
        const key = `${cellX},${cellY}`;

        if (!grid.has(key)) {
            grid.set(key, []);
        }
        grid.get(key).push({ point: p, index: i });
    }

    // Grupuj punkty z sąsiednich komórek
    const groups = [];
    const assigned = new Set();

    for (const [key, cellPoints] of grid) {
        for (const { point: seedPoint, index: seedIdx } of cellPoints) {
            if (assigned.has(seedIdx)) continue;

            const group = [seedPoint];
            assigned.add(seedIdx);

            // Sprawdź sąsiednie komórki (3x3)
            const [cx, cy] = key.split(',').map(Number);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const neighborKey = `${cx + dx},${cy + dy}`;
                    const neighbors = grid.get(neighborKey);

                    if (!neighbors) continue;

                    for (const { point: candidate, index: candidateIdx } of neighbors) {
                        if (assigned.has(candidateIdx)) continue;

                        const dist = getGeographicDistance(seedPoint, candidate);
                        if (dist < thresholdMeters) {
                            group.push(candidate);
                            assigned.add(candidateIdx);
                        }
                    }
                }
            }

            if (group.length > 0) {
                groups.push(group);
            }
        }
    }

    return groups;
}

// =====================================================
// SORTOWANIE PUNKTÓW W GRUPIE ("PO SZNURKU")
// =====================================================

/**
 * Główna funkcja sortowania punktów w grupie
 * Wybiera strategię w zależności od typu grupy
 */
function orderPointsInGroup(group, startFrom, endDirection, distances, locMap) {
    if (group.length === 0) return [];
    if (group.length === 1) return group;

    // Dla gęstych obszarów - specjalne sortowanie
    if (group.length >= 3 && isDenseArea(group)) {
        return orderDenseGroup(group, startFrom, endDirection, distances, locMap);
    }

    // Dla małych grup - nearest neighbor z kierunkiem
    if (group.length <= 6) {
        return orderByNearestWithDirection(group, startFrom, endDirection, distances, locMap);
    }

    // Dla większych grup - sortowanie wzdłuż osi
    return orderAlongAxis(group, startFrom, endDirection);
}

/**
 * Sortowanie dla gęstych obszarów
 * Używa: sortowania wzdłuż osi + numerów budynków
 */
function orderDenseGroup(group, startFrom, endDirection, distances, locMap) {
    if (group.length <= 3) {
        return orderByNearestWithDirection(group, startFrom, endDirection, distances, locMap);
    }

    // Określ główną oś grupy
    const latSpread = Math.max(...group.map(p => p.lat)) - Math.min(...group.map(p => p.lat));
    const lngSpread = Math.max(...group.map(p => p.lng)) - Math.min(...group.map(p => p.lng));
    const isNorthSouth = latSpread > lngSpread;

    // Sortuj wzdłuż osi
    const sorted = [...group].sort((a, b) => {
        return isNorthSouth ? (a.lat - b.lat) : (a.lng - b.lng);
    });

    // Sprawdź numery budynków
    const withNumbers = sorted.map(p => ({
        point: p,
        number: extractBuildingNumber(p)
    }));

    const hasNumbers = withNumbers.filter(w => w.number !== null).length > sorted.length * 0.5;

    if (hasNumbers) {
        // Sortuj: nieparzyste rosnąco → parzyste malejąco (jak kurier)
        const odd = withNumbers.filter(w => w.number !== null && w.number % 2 === 1)
            .sort((a, b) => a.number - b.number);
        const even = withNumbers.filter(w => w.number !== null && w.number % 2 === 0)
            .sort((a, b) => b.number - a.number);
        const noNumber = withNumbers.filter(w => w.number === null);

        const orderedByNumbers = [...odd, ...even, ...noNumber].map(w => w.point);
        return adjustDirectionForGroup(orderedByNumbers, startFrom, endDirection);
    }

    return adjustDirectionForGroup(sorted, startFrom, endDirection);
}

/**
 * Sortowanie wzdłuż głównej osi (N-S lub E-W)
 */
function orderAlongAxis(group, startFrom, endDirection) {
    const latSpread = Math.max(...group.map(p => p.lat)) - Math.min(...group.map(p => p.lat));
    const lngSpread = Math.max(...group.map(p => p.lng)) - Math.min(...group.map(p => p.lng));

    const sorted = [...group].sort((a, b) => {
        if (latSpread > lngSpread) {
            return a.lat - b.lat; // Sortuj N → S
        } else {
            return a.lng - b.lng; // Sortuj W → E
        }
    });

    return adjustDirectionForGroup(sorted, startFrom, endDirection);
}

/**
 * Dostosowuje kierunek grupy (zaczyna od bliższego końca)
 */
function adjustDirectionForGroup(orderedGroup, startFrom, endDirection) {
    if (orderedGroup.length <= 1) return orderedGroup;

    const first = orderedGroup[0];
    const last = orderedGroup[orderedGroup.length - 1];

    const distStartToFirst = getGeographicDistance(startFrom, first);
    const distStartToLast = getGeographicDistance(startFrom, last);

    // Jeśli bliżej do ostatniego - odwróć
    if (distStartToLast < distStartToFirst * 0.8) {
        return orderedGroup.reverse();
    }

    // Jeśli mamy kierunek końcowy, sprawdź czy idziemy w dobrą stronę
    if (endDirection) {
        const distFirstToEnd = getGeographicDistance(first, endDirection);
        const distLastToEnd = getGeographicDistance(last, endDirection);

        // Jeśli last jest dalej od celu niż first - może warto odwrócić
        if (distLastToEnd > distFirstToEnd * 1.3 && distStartToFirst < distStartToLast * 1.3) {
            return orderedGroup.reverse();
        }
    }

    return orderedGroup;
}

/**
 * Nearest neighbor z preferencją kierunku
 * Unika cofania się i skakania
 */
function orderByNearestWithDirection(points, startFrom, endDirection, distances, locMap) {
    if (points.length === 0) return [];

    const ordered = [];
    const remaining = [...points];
    let current = startFrom;
    let lastDirection = null;

    while (remaining.length > 0) {
        let bestIdx = 0;
        let bestScore = Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            const dist = getDistanceBetween(current, candidate, distances, locMap);

            // Kara za cofanie się
            let directionPenalty = 0;
            if (lastDirection && ordered.length > 0) {
                const newDir = {
                    lat: candidate.lat - current.lat,
                    lng: candidate.lng - current.lng
                };
                const dot = newDir.lat * lastDirection.lat + newDir.lng * lastDirection.lng;
                if (dot < 0) {
                    directionPenalty = dist * 0.4; // 40% kary za cofanie
                }
            }

            // Bonus za kierunek do celu końcowego
            let endBonus = 0;
            if (endDirection && remaining.length > 1) {
                const distCandidateToEnd = getGeographicDistance(candidate, endDirection);
                const distCurrentToEnd = getGeographicDistance(current, endDirection);
                if (distCandidateToEnd < distCurrentToEnd) {
                    endBonus = -dist * 0.1; // 10% bonus
                }
            }

            const score = dist + directionPenalty + endBonus;

            if (score < bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }

        const selected = remaining[bestIdx];

        // Aktualizuj kierunek
        if (current !== startFrom || ordered.length > 0) {
            lastDirection = {
                lat: selected.lat - current.lat,
                lng: selected.lng - current.lng
            };
        }

        ordered.push(selected);
        remaining.splice(bestIdx, 1);
        current = selected;
    }

    return ordered;
}

// =====================================================
// GRUPOWANIE WEDŁUG OKIEN CZASOWYCH
// =====================================================

/**
 * Grupuje punkty według slotów czasowych i lokalizacji
 * POPRAWKA v6.3: Węziej sloty (45 zamiast 90 minut)
 */
function groupByTimeAndLocation(points, startTime) {
    const TIME_SLOT_MINUTES = 45; // POPRAWIONE z 90 na 45 minut

    const withWindow = [];
    const withoutWindow = [];

    for (const p of points) {
        const tw = parseTimeWindow(p);

        if (tw.hasWindow) {
            const slot = Math.floor(tw.targetMinutes / TIME_SLOT_MINUTES);
            withWindow.push({
                point: p,
                targetMin: tw.targetMinutes,
                urgency: tw.urgency,
                slot: slot,
                hasFrom: tw.hasFrom,
                hasTo: tw.hasTo
            });
        } else {
            withoutWindow.push(p);
        }
    }

    // Grupuj punkty według slotów
    const slots = new Map();
    for (const item of withWindow) {
        if (!slots.has(item.slot)) {
            slots.set(item.slot, []);
        }
        slots.get(item.slot).push(item);
    }

    // Sortuj sloty chronologicznie
    const sortedSlots = [...slots.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([slot, items]) => {
            // W ramach slotu: sortuj po urgency i targetMin
            items.sort((a, b) => {
                // Najpierw deadline (tylko "do")
                if (a.hasTo && !a.hasFrom && (!b.hasTo || b.hasFrom)) return -1;
                if (b.hasTo && !b.hasFrom && (!a.hasTo || a.hasFrom)) return 1;

                // Potem urgency
                if (b.urgency !== a.urgency) return b.urgency - a.urgency;

                // Na końcu czas docelowy
                return a.targetMin - b.targetMin;
            });

            const slotPoints = items.map(i => i.point);
            const proximityGroups = groupPointsByProximity(slotPoints);

            return {
                slot,
                startMin: slot * TIME_SLOT_MINUTES,
                endMin: (slot + 1) * TIME_SLOT_MINUTES,
                groups: proximityGroups,
                allPoints: slotPoints,
                maxUrgency: Math.max(...items.map(i => i.urgency)),
                avgTargetMin: items.reduce((sum, i) => sum + i.targetMin, 0) / items.length
            };
        });

    return {
        timedSlots: sortedSlots,
        untimedPoints: withoutWindow
    };
}

// =====================================================
// WALIDACJA KOLEJNOŚCI TRASY
// =====================================================

/**
 * Sprawdza czy trasa respektuje ograniczenia:
 * - FIRST przed NORMAL
 * - NORMAL przed RETURN
 * - FIRST przed RETURN
 */
function isValidRouteOrder(route, returnKeys, firstKeys) {
    if (returnKeys.length === 0 && firstKeys.length === 0) return true;

    const firstPositions = [];
    const normalPositions = [];
    const returnPositions = [];

    for (let i = 1; i < route.length - 1; i++) {
        const key = `${route[i].lat},${route[i].lng}`;

        if (firstKeys.includes(key)) {
            firstPositions.push(i);
        } else if (returnKeys.includes(key)) {
            returnPositions.push(i);
        } else {
            normalPositions.push(i);
        }
    }

    // First musi być przed Normal
    if (firstPositions.length > 0 && normalPositions.length > 0) {
        if (Math.max(...firstPositions) > Math.min(...normalPositions)) {
            return false;
        }
    }

    // Return musi być po Normal
    if (returnPositions.length > 0 && normalPositions.length > 0) {
        if (Math.min(...returnPositions) <= Math.max(...normalPositions)) {
            return false;
        }
    }

    // First musi być przed Return
    if (firstPositions.length > 0 && returnPositions.length > 0) {
        if (Math.max(...firstPositions) >= Math.min(...returnPositions)) {
            return false;
        }
    }

    return true;
}

// =====================================================
// BUDOWA TRASY POCZĄTKOWEJ
// =====================================================

/**
 * Buduje trasę początkową z pełną logiką kurierską
 */
function buildInitialRoute(start, end, firstPts, normalPts, returnPts,
    distances, durations, locMap, startTime, stopTimeMinutes, options = {}) {

    const startFromNearest = options.startFromNearest ?? DEFAULT_START_FROM_NEAREST;

    const hasTimeWindows = [...firstPts, ...normalPts, ...returnPts].some(p =>
        p.timeFrom || p.timeTo
    );

    // Sprawdź czy powinniśmy zacząć od najbliższego punktu
    const shouldStartFromNearest = startFromNearest && firstPts.length === 0;

    console.log(`📋 Budowanie trasy:`);
    console.log(`   First: ${firstPts.length}, Normal: ${normalPts.length}, Return: ${returnPts.length}`);
    console.log(`   Okna czasowe: ${hasTimeWindows ? 'TAK' : 'NIE'}`);
    console.log(`   Start od najbliższego: ${shouldStartFromNearest ? 'TAK' : 'NIE'}`);

    // ========== FIRST POINTS ==========
    let orderedFirst = [];
    if (firstPts.length > 0) {
        const nextSection = normalPts.length > 0 ? calculateCentroid(normalPts) : end;
        orderedFirst = buildSectionRoute(firstPts, start, nextSection, distances, locMap, true);
        console.log(`   ✓ First: ${orderedFirst.length} punktów`);
    }

    // ========== NORMAL POINTS ==========
    let orderedNormal = [];
    const afterFirst = orderedFirst.length > 0 ? orderedFirst[orderedFirst.length - 1] : start;

    if (normalPts.length > 0) {
        const nextSection = returnPts.length > 0 ? calculateCentroid(returnPts) : end;

        if (hasTimeWindows) {
            orderedNormal = buildTimeAwareRoute(normalPts, afterFirst, nextSection,
                distances, durations, locMap, startTime, stopTimeMinutes,
                orderedFirst.length, shouldStartFromNearest);
        } else {
            orderedNormal = buildSectionRoute(normalPts, afterFirst, nextSection,
                distances, locMap, shouldStartFromNearest);
        }
        console.log(`   ✓ Normal: ${orderedNormal.length} punktów`);
    }

    // ========== RETURN POINTS ==========
    let orderedReturn = [];
    const afterNormal = orderedNormal.length > 0
        ? orderedNormal[orderedNormal.length - 1]
        : afterFirst;

    if (returnPts.length > 0) {
        orderedReturn = buildSectionRoute(returnPts, afterNormal, end, distances, locMap, false);
        console.log(`   ✓ Return: ${orderedReturn.length} punktów`);
    }

    return [start, ...orderedFirst, ...orderedNormal, ...orderedReturn, end];
}

/**
 * Buduje trasę dla sekcji bez okien czasowych
 */
function buildSectionRoute(points, startFrom, endDirection, distances, locMap, forceNearestFirst = false) {
    if (points.length === 0) return [];

    // Jeśli wymuszamy start od najbliższego - znajdź go
    if (forceNearestFirst && points.length > 1) {
        const nearest = findNearestPoint(startFrom, points, distances, locMap);

        if (nearest) {
            console.log(`      📍 Najbliższy punkt: ${(nearest.distance / 1000).toFixed(2)}km`);

            const nearestPoint = nearest.point;
            const otherPoints = points.filter((_, i) => i !== nearest.index);

            const groups = groupPointsByProximity(otherPoints);

            let firstGroup = [nearestPoint];
            if (groups.length > 0) {
                const firstGroupCentroid = calculateCentroid(groups[0]);
                const distToFirstGroup = getGeographicDistance(nearestPoint, firstGroupCentroid);

                if (distToFirstGroup < PROXIMITY_THRESHOLD_METERS * 2) {
                    firstGroup = [nearestPoint, ...groups[0]];
                    groups.shift();
                }
            }

            const nextGroupCentroid = groups.length > 0 ? calculateCentroid(groups[0]) : endDirection;
            const orderedFirst = orderPointsInGroup(firstGroup, startFrom, nextGroupCentroid, distances, locMap);

            const nearestInOrdered = orderedFirst.findIndex(p => p === nearestPoint);
            if (nearestInOrdered > 0) {
                orderedFirst.splice(nearestInOrdered, 1);
                orderedFirst.unshift(nearestPoint);
            }

            const lastOfFirst = orderedFirst[orderedFirst.length - 1];
            const restOrdered = orderGroupsSequentially(groups, lastOfFirst, endDirection, distances, locMap);

            return [...orderedFirst, ...restOrdered];
        }
    }

    const groups = groupPointsByProximity(points);
    return orderGroupsSequentially(groups, startFrom, endDirection, distances, locMap);
}

/**
 * Buduje trasę z uwzględnieniem okien czasowych
 */
function buildTimeAwareRoute(points, startFrom, endDirection, distances, durations,
    locMap, startTime, stopTimeMinutes, alreadyVisited, forceNearestFirst = false) {

    if (points.length === 0) return [];

    const grouped = groupByTimeAndLocation(points, startTime);
    const ordered = [];
    let currentPos = startFrom;
    let isFirstPoint = true;

    // Przetwarzaj sloty czasowe chronologicznie
    for (const slot of grouped.timedSlots) {
        console.log(`      ⏰ Slot ${formatMinutes(slot.startMin)}-${formatMinutes(slot.endMin)}: ${slot.allPoints.length} pkt`);

        let orderedGroups = orderGroupsByDistance(slot.groups, currentPos);

        if (forceNearestFirst && isFirstPoint && orderedGroups.length > 0) {
            const firstGroup = orderedGroups[0];
            const nearest = findNearestPoint(startFrom, firstGroup, distances, locMap);

            if (nearest) {
                console.log(`      📍 Najbliższy w pierwszym slocie: ${(nearest.distance / 1000).toFixed(2)}km`);

                const nearestPoint = nearest.point;
                const nextGroup = orderedGroups[1];
                const nextPos = nextGroup ? calculateCentroid(nextGroup) : endDirection;

                let orderedGroup = orderPointsInGroup(firstGroup, startFrom, nextPos, distances, locMap);

                const nearestInOrdered = orderedGroup.findIndex(p => p === nearestPoint);
                if (nearestInOrdered > 0) {
                    orderedGroup.splice(nearestInOrdered, 1);
                    orderedGroup.unshift(nearestPoint);
                }

                ordered.push(...orderedGroup);
                currentPos = orderedGroup[orderedGroup.length - 1];
                orderedGroups = orderedGroups.slice(1);
                isFirstPoint = false;
            }
        }

        for (const group of orderedGroups) {
            const groupIdx = orderedGroups.indexOf(group);
            const nextGroup = orderedGroups[groupIdx + 1];
            const nextPos = nextGroup ? calculateCentroid(nextGroup) : endDirection;

            const orderedGroup = orderPointsInGroup(group, currentPos, nextPos, distances, locMap);
            ordered.push(...orderedGroup);

            if (orderedGroup.length > 0) {
                currentPos = orderedGroup[orderedGroup.length - 1];
            }

            isFirstPoint = false;
        }
    }

    // Wstaw punkty bez okien czasowych
    if (grouped.untimedPoints.length > 0) {
        console.log(`      📍 Bez okien: ${grouped.untimedPoints.length} pkt`);
        return insertUntimedPointsImproved(ordered, grouped.untimedPoints, startFrom, endDirection,
            distances, durations, locMap, startTime, stopTimeMinutes, forceNearestFirst && ordered.length === 0);
    }

    return ordered;
}

/**
 * Sortuje grupy według odległości od punktu
 */
function orderGroupsByDistance(groups, fromPoint) {
    return [...groups].sort((a, b) => {
        const distA = Math.min(...a.map(p => getGeographicDistance(fromPoint, p)));
        const distB = Math.min(...b.map(p => getGeographicDistance(fromPoint, p)));
        return distA - distB;
    });
}

/**
 * Uporządkowuje grupy sekwencyjnie
 */
function orderGroupsSequentially(groups, startFrom, endDirection, distances, locMap) {
    if (groups.length === 0) return [];

    const ordered = [];
    const remaining = [...groups];
    let currentPos = startFrom;

    while (remaining.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const group = remaining[i];
            const nearestInGroup = Math.min(...group.map(p =>
                getDistanceBetween(currentPos, p, distances, locMap)
            ));

            if (nearestInGroup < minDist) {
                minDist = nearestInGroup;
                nearestIdx = i;
            }
        }

        const selectedGroup = remaining.splice(nearestIdx, 1)[0];

        let groupEndDirection = endDirection;
        if (remaining.length > 0) {
            const nextGroupCentroids = remaining.map(g => calculateCentroid(g));
            const selectedCentroid = calculateCentroid(selectedGroup);
            const nearestNext = nextGroupCentroids.reduce((nearest, c) => {
                const distNearest = getGeographicDistance(selectedCentroid, nearest);
                const distC = getGeographicDistance(selectedCentroid, c);
                return distC < distNearest ? c : nearest;
            });
            groupEndDirection = nearestNext;
        }

        const orderedGroup = orderPointsInGroup(selectedGroup, currentPos, groupEndDirection, distances, locMap);
        ordered.push(...orderedGroup);

        if (orderedGroup.length > 0) {
            currentPos = orderedGroup[orderedGroup.length - 1];
        }
    }

    return ordered;
}

/**
 * POPRAWKA v6.3: Ulepszone wstawianie punktów bez okien
 * Uwzględnia wpływ na okna czasowe sąsiednich punktów
 */
function insertUntimedPointsImproved(timedRoute, untimedPoints, startFrom, endPoint,
    distances, durations, locMap, startTime, stopTimeMinutes, forceNearestFirst = false) {
    if (untimedPoints.length === 0) return timedRoute;

    if (timedRoute.length === 0 && forceNearestFirst) {
        return buildSectionRoute(untimedPoints, startFrom, endPoint, distances, locMap, true);
    }

    const groups = groupPointsByProximity(untimedPoints);
    let result = [...timedRoute];

    for (const group of groups) {
        const groupCentroid = calculateCentroid(group);

        let bestPos = result.length;
        let bestCost = Infinity;

        for (let pos = 0; pos <= result.length; pos++) {
            const prevPoint = pos > 0 ? result[pos - 1] : startFrom;
            const nextPoint = pos < result.length ? result[pos] : endPoint;

            // Koszt dystansu
            const distPrevToGroup = getDistanceBetween(prevPoint, groupCentroid, distances, locMap);
            const distGroupToNext = getDistanceBetween(groupCentroid, nextPoint, distances, locMap);
            const directDist = getDistanceBetween(prevPoint, nextPoint, distances, locMap);
            const insertDistCost = distPrevToGroup + distGroupToNext - directDist;

            // NOWE: Koszt wpływu na okna czasowe sąsiadów
            let timeImpactCost = 0;

            // Dodatkowy czas wprowadzony przez grupę i przejazd (ze zmiennym czasem obsługi)
            let groupVisitTime = 0;
            for (const p of group) {
                groupVisitTime += getVariableStopTime(p.address || '', stopTimeMinutes, pos) * 60;
            }
            const extraTravelTime = (distPrevToGroup + distGroupToNext - directDist) / 13.8; // Szacowane 50km/h
            const totalDelayForNextPoints = groupVisitTime + extraTravelTime;

            // Sprawdź wpływ na punkty po wstawieniu
            if (pos < result.length) {
                // Oblicz bazowy czas przyjazdu do pos-tego punktu przed wstawieniem (uproszczone)
                // W rzeczywistości lepiej byłoby przeliczyć fragment trasy, ale szacujemy wpływ
                for (let k = pos; k < Math.min(pos + 8, result.length); k++) {
                    const point = result[k];
                    const tw = parseTimeWindow(point);

                    if (tw.hasWindow) {
                        // Punkt będzie opóźniony o całkowity czas grupy i nadłożonej drogi
                        // Jeśli punkt ma targetMinutes, sprawdzamy czy opóźnienie go oddala czy przybliża (np. jeśli był za wcześnie)
                        // Dla uproszczenia: im wyższa urgency, tym bardziej unikamy opóźniania
                        timeImpactCost += (totalDelayForNextPoints / 60) * tw.urgency * 100;
                    }
                }
            }

            // Bonus za bliskość
            let proximityBonus = 0;
            if (pos > 0 && pos < result.length) {
                const nearbyDist = Math.min(
                    getGeographicDistance(result[pos - 1], groupCentroid),
                    getGeographicDistance(result[pos], groupCentroid)
                );
                if (nearbyDist < PROXIMITY_THRESHOLD_METERS * 2) {
                    proximityBonus = -insertDistCost * 0.2;
                }
            }

            const totalCost = insertDistCost + timeImpactCost + proximityBonus;

            if (totalCost < bestCost) {
                bestCost = totalCost;
                bestPos = pos;
            }
        }

        const prevPoint = bestPos > 0 ? result[bestPos - 1] : startFrom;
        const nextPoint = bestPos < result.length ? result[bestPos] : endPoint;
        const orderedGroup = orderPointsInGroup(group, prevPoint, nextPoint, distances, locMap);

        result.splice(bestPos, 0, ...orderedGroup);
    }

    return result;
}

// =====================================================
// ELIMINACJA PRZECIĘĆ
// =====================================================

/**
 * Eliminuje przecięcia w trasie
 */
function eliminateCrossings(route, distances, locMap, returnKeys, firstKeys) {
    let currentRoute = [...route];
    let improved = true;
    let iterations = 0;

    while (improved && iterations < 50) {
        improved = false;
        iterations++;

        for (let i = 0; i < currentRoute.length - 3; i++) {
            for (let j = i + 2; j < currentRoute.length - 1; j++) {
                if (segmentsIntersect(currentRoute[i], currentRoute[i + 1],
                    currentRoute[j], currentRoute[j + 1])) {

                    const newRoute = [...currentRoute];
                    const segment = newRoute.slice(i + 1, j + 1).reverse();
                    newRoute.splice(i + 1, j - i, ...segment);

                    if (isValidRouteOrder(newRoute, returnKeys, firstKeys)) {
                        currentRoute = newRoute;
                        improved = true;
                        break;
                    }
                }
            }
            if (improved) break;
        }
    }

    return currentRoute;
}

// =====================================================
// OPTYMALIZACJA 2-OPT
// =====================================================

/**
 * Oblicza deltę dla 2-opt z kontrolą skoków - O(1)
 */
function calculate2OptDelta(route, i, j, distances, locMap) {
    const idx_im1 = locMap.get(route[i - 1]);
    const idx_i = locMap.get(route[i]);
    const idx_j = locMap.get(route[j]);
    const idx_jp1 = locMap.get(route[j + 1]);

    if (idx_im1 === undefined || idx_i === undefined ||
        idx_j === undefined || idx_jp1 === undefined) {
        return 0;
    }

    const oldEdge1 = distances[idx_im1][idx_i];
    const oldEdge2 = distances[idx_j][idx_jp1];
    const newEdge1 = distances[idx_im1][idx_j];
    const newEdge2 = distances[idx_i][idx_jp1];

    let delta = (newEdge1 + newEdge2) - (oldEdge1 + oldEdge2);

    // Kara za tworzenie dużych skoków
    if (newEdge1 > MAX_REASONABLE_JUMP_METERS && newEdge1 > oldEdge1 * JUMP_PENALTY_MULTIPLIER) {
        delta += (newEdge1 - MAX_REASONABLE_JUMP_METERS) * 0.5;
    }
    if (newEdge2 > MAX_REASONABLE_JUMP_METERS && newEdge2 > oldEdge2 * JUMP_PENALTY_MULTIPLIER) {
        delta += (newEdge2 - MAX_REASONABLE_JUMP_METERS) * 0.5;
    }

    return delta;
}

/**
 * POPRAWKA v6.3: 2-opt z uwzględnieniem czasu
 * Optymalizuje zarówno dystans jak i zgodność z oknami czasowymi
 */
function calculate2OptDeltaWithTime(route, i, j, distances, durations, locMap,
    startTime, stopTimeMinutes) {
    // Oblicz deltę dystansu
    const idx_im1 = locMap.get(route[i - 1]);
    const idx_i = locMap.get(route[i]);
    const idx_j = locMap.get(route[j]);
    const idx_jp1 = locMap.get(route[j + 1]);

    if (idx_im1 === undefined || idx_i === undefined ||
        idx_j === undefined || idx_jp1 === undefined) {
        return 0;
    }

    const oldEdge1 = distances[idx_im1][idx_i];
    const oldEdge2 = distances[idx_j][idx_jp1];
    const newEdge1 = distances[idx_im1][idx_j];
    const newEdge2 = distances[idx_i][idx_jp1];

    let deltaDist = (newEdge1 + newEdge2) - (oldEdge1 + oldEdge2);

    // Kara za duże skoki
    if (newEdge1 > MAX_REASONABLE_JUMP_METERS && newEdge1 > oldEdge1 * JUMP_PENALTY_MULTIPLIER) {
        deltaDist += (newEdge1 - MAX_REASONABLE_JUMP_METERS) * 0.5;
    }
    if (newEdge2 > MAX_REASONABLE_JUMP_METERS && newEdge2 > oldEdge2 * JUMP_PENALTY_MULTIPLIER) {
        deltaDist += (newEdge2 - MAX_REASONABLE_JUMP_METERS) * 0.5;
    }

    // NOWE: Oblicz wpływ na okna czasowe
    let deltaTime = 0;

    const pointsInRange = route.slice(i, j + 1);

    if (pointsInRange.some(p => p.timeFrom || p.timeTo)) {
        // Oblicz czas dotarcia do punktu i (ze zmiennym czasem obsługi)
        let cumTime = 0;
        for (let k = 0; k < i; k++) {
            const prevIdx = locMap.get(route[k]);
            const currIdx = locMap.get(route[k + 1]);
            if (prevIdx !== undefined && currIdx !== undefined) {
                cumTime += durations[prevIdx][currIdx];
            }
            if (k < route.length - 1) {
                cumTime += getVariableStopTime(route[k].address || '', stopTimeMinutes, k) * 60;
            }
        }

        // Koszt przed zmianą
        let costBefore = 0;
        let timeBefore = cumTime;
        for (let k = i; k <= j; k++) {
            if (k > i) {
                const prevIdx = locMap.get(route[k - 1]);
                const currIdx = locMap.get(route[k]);
                if (prevIdx !== undefined && currIdx !== undefined) {
                    timeBefore += durations[prevIdx][currIdx];
                }
                timeBefore += getVariableStopTime(route[k - 1].address || '', stopTimeMinutes, k - 1) * 60;
            }
            const arrivalMin = (new Date(startTime.getTime() + timeBefore * 1000)).getHours() * 60 +
                (new Date(startTime.getTime() + timeBefore * 1000)).getMinutes();
            costBefore += calculateTimeWindowCost(arrivalMin, route[k]);
        }

        // Koszt po zmianie (segment odwrócony)
        let costAfter = 0;
        let timeAfter = cumTime;
        for (let k = j; k >= i; k--) {
            if (k < j) {
                const prevIdx = locMap.get(route[k + 1]);
                const currIdx = locMap.get(route[k]);
                if (prevIdx !== undefined && currIdx !== undefined) {
                    timeAfter += durations[prevIdx][currIdx];
                }
                timeAfter += getVariableStopTime(route[k + 1].address || '', stopTimeMinutes, k + 1) * 60;
            }
            const arrivalMin = (new Date(startTime.getTime() + timeAfter * 1000)).getHours() * 60 +
                (new Date(startTime.getTime() + timeAfter * 1000)).getMinutes();
            costAfter += calculateTimeWindowCost(arrivalMin, route[k]);
        }

        deltaTime = (costAfter - costBefore); // Usuwamy dzielenie przez 1000 - czas jest teraz priorytetem!
    }

    return deltaDist + deltaTime;
}

/**
 * Odwraca segment trasy dla 2-opt
 */
function reverse2OptSegment(route, i, j) {
    const newRoute = [...route];
    const segment = newRoute.slice(i, j + 1).reverse();
    newRoute.splice(i, j - i + 1, ...segment);
    return newRoute;
}

/**
 * POPRAWKA v6.3: Szybki 2-opt z uwzględnieniem okien czasowych
 */
function fast2OptWithTime(route, distances, durations, locMap, returnKeys, firstKeys,
    startTime, stopTimeMinutes) {
    let currentRoute = [...route];
    let improved = true;
    let totalImprovement = 0;
    let iterations = 0;

    const hasTimeWindows = currentRoute.some(p => p.timeFrom || p.timeTo);

    while (improved && iterations < 100) {
        improved = false;
        iterations++;

        for (let i = 1; i < currentRoute.length - 2; i++) {
            for (let j = i + 1; j < currentRoute.length - 1; j++) {
                let delta;

                if (hasTimeWindows) {
                    delta = calculate2OptDeltaWithTime(currentRoute, i, j, distances,
                        durations, locMap, startTime, stopTimeMinutes);
                } else {
                    delta = calculate2OptDelta(currentRoute, i, j, distances, locMap);
                }

                if (delta < -10) {
                    const newRoute = reverse2OptSegment(currentRoute, i, j);

                    if (isValidRouteOrder(newRoute, returnKeys, firstKeys)) {
                        currentRoute = newRoute;
                        totalImprovement += Math.abs(delta);
                        improved = true;
                        break;
                    }
                }
            }
            if (improved) break;
        }
    }

    return { route: currentRoute, improvement: totalImprovement, iterations };
}

// =====================================================
// OPTYMALIZACJA OR-OPT
// =====================================================

/**
 * OR-opt - przesuwa pojedyncze punkty lub małe segmenty
 */
function orOptOptimization(route, distances, locMap, returnKeys, firstKeys) {
    let currentRoute = [...route];
    let improved = true;
    let iterations = 0;

    while (improved && iterations < 50) {
        improved = false;
        iterations++;

        for (let segSize = 1; segSize <= 3; segSize++) {
            if (improved) break;

            for (let i = 1; i < currentRoute.length - segSize - 1; i++) {
                const pointKey = `${currentRoute[i].lat},${currentRoute[i].lng}`;
                if (returnKeys.includes(pointKey) || firstKeys.includes(pointKey)) continue;

                const idx_prev = locMap.get(currentRoute[i - 1]);
                const idx_first = locMap.get(currentRoute[i]);
                const idx_last = locMap.get(currentRoute[i + segSize - 1]);
                const idx_next = locMap.get(currentRoute[i + segSize]);

                if (idx_prev === undefined || idx_first === undefined ||
                    idx_last === undefined || idx_next === undefined) continue;

                const removeCost = distances[idx_prev][idx_first] + distances[idx_last][idx_next];
                const directCost = distances[idx_prev][idx_next];
                const removalSaving = removeCost - directCost;

                let bestNewPos = -1;
                let bestImprovement = 0;

                for (let j = 1; j < currentRoute.length - segSize; j++) {
                    if (j >= i - 1 && j <= i + segSize) continue;

                    const idx_a = locMap.get(currentRoute[j - 1]);
                    const idx_b = locMap.get(currentRoute[j]);

                    if (idx_a === undefined || idx_b === undefined) continue;

                    const insertCost = distances[idx_a][idx_first] +
                        distances[idx_last][idx_b] -
                        distances[idx_a][idx_b];
                    const netImprovement = removalSaving - insertCost;

                    const newEdge1 = distances[idx_a][idx_first];
                    const newEdge2 = distances[idx_last][idx_b];
                    const createsJump = newEdge1 > MAX_REASONABLE_JUMP_METERS ||
                        newEdge2 > MAX_REASONABLE_JUMP_METERS;

                    const adjustedImprovement = createsJump ? netImprovement - 500 : netImprovement;

                    if (adjustedImprovement > bestImprovement + 20) {
                        bestImprovement = adjustedImprovement;
                        bestNewPos = j;
                    }
                }

                if (bestNewPos >= 0) {
                    const segment = currentRoute.splice(i, segSize);
                    const insertPos = bestNewPos > i ? bestNewPos - segSize : bestNewPos;
                    currentRoute.splice(insertPos, 0, ...segment);

                    if (isValidRouteOrder(currentRoute, returnKeys, firstKeys)) {
                        improved = true;
                        break;
                    } else {
                        currentRoute.splice(insertPos, segSize);
                        currentRoute.splice(i, 0, ...segment);
                    }
                }
            }
        }
    }

    return currentRoute;
}

// =====================================================
// OPTYMALIZACJA OKIEN CZASOWYCH
// =====================================================

/**
 * Optymalizuje trasę pod kątem okien czasowych
 */
function optimizeTimeWindows(route, distances, durations, locMap, returnKeys, firstKeys, startTime, stopTime) {
    const hasTimeWindows = route.some(p => p.timeFrom || p.timeTo);
    if (!hasTimeWindows) return route;

    let currentRoute = [...route];
    let analysis = analyzeTimeWindows(currentRoute, durations, locMap, startTime, stopTime);

    if (analysis.violations === 0) {
        console.log(`   ✅ Okna czasowe: brak naruszeń`);
        return currentRoute;
    }

    console.log(`   ⏰ Optymalizacja okien: ${analysis.violations} naruszeń`);

    let improved = true;
    let iterations = 0;

    while (improved && iterations < 30 && analysis.violations > 0) {
        improved = false;
        iterations++;

        const problems = analysis.details
            .filter(d => d.status === 'late' || d.status === 'early')
            .sort((a, b) => {
                if ((b.urgency || 0) !== (a.urgency || 0)) {
                    return (b.urgency || 0) - (a.urgency || 0);
                }
                return (b.delay + b.early) - (a.delay + a.early);
            });

        for (const problem of problems) {
            const pointIdx = currentRoute.findIndex(p => p === problem.point);
            if (pointIdx <= 0 || pointIdx >= currentRoute.length - 1) continue;

            const pointKey = `${problem.point.lat},${problem.point.lng}`;
            if (returnKeys.includes(pointKey) || firstKeys.includes(pointKey)) continue;

            const point = currentRoute[pointIdx];
            let bestPos = pointIdx;
            let bestScore = analysis.violations * 1000 + analysis.penalty;

            for (let newPos = 1; newPos < currentRoute.length - 1; newPos++) {
                if (newPos === pointIdx) continue;

                const testRoute = [...currentRoute];
                testRoute.splice(pointIdx, 1);
                const insertPos = newPos > pointIdx ? newPos - 1 : newPos;
                testRoute.splice(insertPos, 0, point);

                if (!isValidRouteOrder(testRoute, returnKeys, firstKeys)) continue;

                const testAnalysis = analyzeTimeWindows(testRoute, durations, locMap, startTime, stopTime);
                const testScore = testAnalysis.violations * 1000 + testAnalysis.penalty;

                const prevIdx = locMap.get(testRoute[insertPos - 1]);
                const currIdx = locMap.get(testRoute[insertPos]);
                const nextIdx = locMap.get(testRoute[insertPos + 1]);

                let jumpPenalty = 0;
                if (prevIdx !== undefined && currIdx !== undefined) {
                    const edge1 = distances[prevIdx][currIdx];
                    if (edge1 > MAX_REASONABLE_JUMP_METERS) jumpPenalty += 100;
                }
                if (currIdx !== undefined && nextIdx !== undefined) {
                    const edge2 = distances[currIdx][nextIdx];
                    if (edge2 > MAX_REASONABLE_JUMP_METERS) jumpPenalty += 100;
                }

                const adjustedScore = testScore + jumpPenalty;

                if (adjustedScore < bestScore - 50) {
                    bestScore = adjustedScore;
                    bestPos = newPos;
                }
            }

            if (bestPos !== pointIdx) {
                currentRoute.splice(pointIdx, 1);
                const insertPos = bestPos > pointIdx ? bestPos - 1 : bestPos;
                currentRoute.splice(insertPos, 0, point);
                analysis = analyzeTimeWindows(currentRoute, durations, locMap, startTime, stopTime);
                improved = true;
                break;
            }
        }
    }

    console.log(`   ✅ Po optymalizacji: ${analysis.violations} naruszeń`);
    return currentRoute;
}

// =====================================================
// ANALIZA PŁYNNOŚCI TRASY
// =====================================================

/**
 * Analizuje płynność trasy (wykrywa duże skoki)
 */
function analyzeRouteFlow(route, distances, locMap) {
    let jumpCount = 0;
    let maxJump = 0;
    const jumps = [];
    let totalDist = 0;

    for (let i = 0; i < route.length - 1; i++) {
        const dist = getDistanceBetween(route[i], route[i + 1], distances, locMap);
        totalDist += dist;

        if (dist > MAX_REASONABLE_JUMP_METERS) {
            jumpCount++;
            jumps.push({ from: i, to: i + 1, distance: dist });
            if (dist > maxJump) maxJump = dist;
        }
    }

    return { jumpCount, maxJump, jumps, totalDistance: totalDist };
}

// =====================================================
// GŁÓWNA FUNKCJA OPTYMALIZACJI
// =====================================================

/**
 * POPRAWKA v6.3: Optymalizacja uwzględniająca okna czasowe
 */
function advancedOptimization(route, distances, durations, locMap, returnKeys, firstKeys, startTime, stopTime) {
    console.log(`🚀 Optymalizacja dla ${route.length} punktów...`);
    const optimizationStart = Date.now();

    let currentRoute = [...route];
    const initialDist = calcRouteDist(currentRoute, distances, locMap);

    // FAZA 1: Eliminacja przecięć
    console.log('📍 Faza 1: Eliminacja przecięć...');
    currentRoute = eliminateCrossings(currentRoute, distances, locMap, returnKeys, firstKeys);

    // FAZA 2: 2-opt z uwzględnieniem czasu
    console.log('📍 Faza 2: 2-opt (dystans + czas)...');
    const phase2Start = Date.now();
    const result2opt = fast2OptWithTime(currentRoute, distances, durations, locMap,
        returnKeys, firstKeys, startTime, stopTime);
    currentRoute = result2opt.route;
    console.log(`   ${result2opt.iterations} iter, poprawa: ${(result2opt.improvement / 1000).toFixed(2)}km (${((Date.now() - phase2Start) / 1000).toFixed(2)}s)`);

    // FAZA 3: OR-opt
    console.log('📍 Faza 3: OR-opt...');
    const phase3Start = Date.now();
    currentRoute = orOptOptimization(currentRoute, distances, locMap, returnKeys, firstKeys);
    console.log(`   Czas: ${((Date.now() - phase3Start) / 1000).toFixed(2)}s`);

    // FAZA 4: Okna czasowe
    const hasTimeWindows = currentRoute.some(p => p.timeFrom || p.timeTo);
    if (hasTimeWindows) {
        console.log('📍 Faza 4: Okna czasowe...');
        const phase4Start = Date.now();
        currentRoute = optimizeTimeWindows(currentRoute, distances, durations, locMap,
            returnKeys, firstKeys, startTime, stopTime);
        console.log(`   Czas: ${((Date.now() - phase4Start) / 1000).toFixed(2)}s`);
    }

    // FAZA 5: Końcowy 2-opt
    console.log('📍 Faza 5: Końcowy 2-opt...');
    const resultFinal = fast2OptWithTime(currentRoute, distances, durations, locMap,
        returnKeys, firstKeys, startTime, stopTime);
    currentRoute = resultFinal.route;

    // FAZA 6: Analiza płynności
    const flow = analyzeRouteFlow(currentRoute, distances, locMap);
    if (flow.jumpCount > 0) {
        console.log(`   ⚠️ ${flow.jumpCount} dużych skoków (max: ${(flow.maxJump / 1000).toFixed(1)}km)`);
    } else {
        console.log(`   ✅ Trasa płynna`);
    }

    // Podsumowanie
    const finalDist = calcRouteDist(currentRoute, distances, locMap);
    const totalTime = (Date.now() - optimizationStart) / 1000;

    console.log(`✅ Zakończono w ${totalTime.toFixed(2)}s`);
    console.log(`   ${(initialDist / 1000).toFixed(2)}km → ${(finalDist / 1000).toFixed(2)}km`);
    console.log(`   Oszczędność: ${((initialDist - finalDist) / 1000).toFixed(2)}km (${(((initialDist - finalDist) / initialDist) * 100).toFixed(1)}%)`);

    return currentRoute;
}

// =====================================================
// GŁÓWNA FUNKCJA EKSPORTOWA
// =====================================================

/**
 * Optymalizuje trasę kurierską
 */
async function optimizeRoute(startPoint, endPoint, intermediatePoints, stopTimeMinutes = 5,
    reverseRoute = false, startTime = null, options = {}) {

    try {
        const toleranceBefore = options.toleranceBefore ?? TIME_TOLERANCE_BEFORE;
        const toleranceAfter = options.toleranceAfter ?? TIME_TOLERANCE_AFTER;

        const startFromNearest = options.startFromNearest ?? DEFAULT_START_FROM_NEAREST;
        const isCurrentLocation = options.isCurrentLocation ?? false;

        const effectiveStartFromNearest = startFromNearest || isCurrentLocation;

        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║           OPTYMALIZACJA TRAS v6.4 (FIXED WINDOWS)           ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log(`Punkty: ${intermediatePoints.length}`);

        if (effectiveStartFromNearest) {
            console.log(`📍 Tryb: Start od najbliższego punktu ${isCurrentLocation ? '(aktualna pozycja)' : ''}`);
        }

        const firstPoints = intermediatePoints.filter(p => p.firstOnRoute);
        let normalPoints = intermediatePoints.filter(p => !p.returnOnBack && !p.firstOnRoute);
        const returnPoints = intermediatePoints.filter(p => p.returnOnBack);

        console.log(`\n📊 Podział punktów:`);
        console.log(`   🔵 First (początek): ${firstPoints.length}`);
        console.log(`   ⚪ Normal (środek): ${normalPoints.length}`);
        console.log(`   🟢 Return (koniec): ${returnPoints.length}`);

        const withTimeFrom = intermediatePoints.filter(p => p.timeFrom).length;
        const withTimeTo = intermediatePoints.filter(p => p.timeTo).length;
        const withBoth = intermediatePoints.filter(p => p.timeFrom && p.timeTo).length;
        const onlyFrom = withTimeFrom - withBoth;
        const onlyTo = withTimeTo - withBoth;

        console.log(`\n⏰ Okna czasowe:`);
        console.log(`   Pełne (od-do): ${withBoth}`);
        console.log(`   Tylko "od": ${onlyFrom}`);
        console.log(`   Tylko "do": ${onlyTo} ${onlyTo > 0 ? '← deadline!' : ''}`);

        if (reverseRoute) {
            normalPoints = normalPoints.reverse();
            console.log('\n🔄 Odwrócono kolejność');
        }

        const optStartTime = startTime || new Date();
        console.log(`\n🕐 Start: ${formatTime(optStartTime)}`);
        console.log(`⏱️ Tolerancja: -${toleranceBefore}/+${toleranceAfter} min`);

        console.log('\n📡 Pobieranie macierzy odległości...');
        const allLocations = [startPoint, ...intermediatePoints, endPoint];
        const matrixResult = await getCompleteMatrix(allLocations);
        const { distances, durations } = matrixResult;
        console.log(`   Provider: ${matrixResult.provider}`);

        const locMap = new Map();
        allLocations.forEach((loc, idx) => locMap.set(loc, idx));

        const returnKeys = returnPoints.map(p => `${p.lat},${p.lng}`);
        const firstKeys = firstPoints.map(p => `${p.lat},${p.lng}`);

        console.log('\n🔧 Budowanie trasy początkowej...');
        let initialRoute = buildInitialRoute(
            startPoint, endPoint, firstPoints, normalPoints, returnPoints,
            distances, durations, locMap, optStartTime, stopTimeMinutes,
            { startFromNearest: effectiveStartFromNearest }
        );

        const initialDist = calcRouteDist(initialRoute, distances, locMap);
        console.log(`   Dystans początkowy: ${(initialDist / 1000).toFixed(2)}km`);

        const initialAnalysis = analyzeTimeWindows(initialRoute, durations, locMap, optStartTime, stopTimeMinutes);
        console.log(`   Naruszenia okien: ${initialAnalysis.violations}`);

        console.log('\n⚡ Optymalizacja...');
        const optStart = Date.now();
        const optimizedRoute = advancedOptimization(
            initialRoute, distances, durations, locMap,
            returnKeys, firstKeys, optStartTime, stopTimeMinutes
        );
        const optTime = Date.now() - optStart;

        const optimizedDist = calcRouteDist(optimizedRoute, distances, locMap);
        const savings = initialDist - optimizedDist;
        const savingsPercent = initialDist > 0 ? (savings / initialDist) * 100 : 0;

        const finalAnalysis = analyzeTimeWindows(optimizedRoute, durations, locMap, optStartTime, stopTimeMinutes);
        const flowAnalysis = analyzeRouteFlow(optimizedRoute, distances, locMap);

        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║                      PODSUMOWANIE                            ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log(`║ Dystans: ${(initialDist / 1000).toFixed(2)}km → ${(optimizedDist / 1000).toFixed(2)}km`.padEnd(63) + '║');
        console.log(`║ Oszczędność: ${(savings / 1000).toFixed(2)}km (${savingsPercent.toFixed(1)}%)`.padEnd(63) + '║');
        console.log(`║ Naruszenia okien: ${finalAnalysis.violations}`.padEnd(63) + '║');
        console.log(`║ Płynność: ${flowAnalysis.jumpCount === 0 ? '✅ bez skoków' : `⚠️ ${flowAnalysis.jumpCount} skoków`}`.padEnd(63) + '║');
        console.log(`║ Czas optymalizacji: ${(optTime / 1000).toFixed(2)}s`.padEnd(63) + '║');
        console.log('╚══════════════════════════════════════════════════════════════╝');

        showAndroidNotification(`Zoptymalizowano: ${(optimizedDist / 1000).toFixed(1)}km (${savingsPercent.toFixed(0)}%)`);

        return {
            route: optimizedRoute,
            optimizedDistance: optimizedDist,
            optimizedDistanceKm: optimizedDist / 1000,
            durations: durations,
            locationToIndexMap: locMap,
            allLocations: allLocations,
            initialDistance: initialDist,
            savings: savings,
            savingsKm: savings / 1000,
            savingsPercentage: savingsPercent,
            timeWindowAnalysis: finalAnalysis,
            flowAnalysis: flowAnalysis,
            matrixProvider: matrixResult.provider || 'server',
            optimizationTimeMs: optTime,
            config: {
                toleranceBefore,
                toleranceAfter,
                startFromNearest: effectiveStartFromNearest,
                isCurrentLocation
            }
        };

    } catch (error) {
        console.error('❌ Błąd optymalizacji:', error);
        showAndroidNotification(`Błąd: ${error.message}`, 'error');
        throw error;
    }
}

// =====================================================
// FUNKCJE POMOCNICZE EKSPORTOWE
// =====================================================

/**
 * Oblicza czasy przyjazdu dla trasy
 */
function calculateArrivalTimes(route, durations, locMap, startTime, stopTimeMinutes) {
    const arrivals = [];
    let cumTime = 0;

    for (let i = 0; i < route.length; i++) {
        if (i > 0) {
            const prev = route[i - 1];
            const prevIdx = locMap.get(prev);
            const currIdx = locMap.get(route[i]);
            if (prevIdx !== undefined && currIdx !== undefined) {
                cumTime += durations[prevIdx][currIdx];
            }
            if (i < route.length - 1) {
                // Użyj zmiennego czasu obsługi
                cumTime += getVariableStopTime(prev.address || '', stopTimeMinutes, i) * 60;
            }
        }

        const arrivalTime = new Date(startTime.getTime() + cumTime * 1000);
        const point = route[i];
        const tw = parseTimeWindow(point);

        let windowStatus = 'no_window';
        if (tw.hasWindow) {
            const arrivalMin = arrivalTime.getHours() * 60 + arrivalTime.getMinutes();
            const check = isWithinTimeWindow(arrivalMin, point);
            windowStatus = check.valid ? 'ok' : (check.delay > 0 ? 'late' : 'early');
        }

        arrivals.push({
            point: point,
            arrivalTime: arrivalTime,
            arrivalTimeStr: formatTime(arrivalTime),
            cumulativeSeconds: cumTime,
            windowStatus: windowStatus,
            timeWindow: tw.hasWindow ?
                `${point.timeFrom || '---'} - ${point.timeTo || '---'}` : null
        });
    }

    return arrivals;
}

/**
 * Formatuje czas trwania
 */
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
}

/**
 * Formatuje dystans
 */
function formatDistance(meters) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

// =====================================================
// EKSPORT
// =====================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        optimizeRoute,
        calculateArrivalTimes,
        formatDuration,
        formatDistance,
        checkMatrixProviders,
        resetMatrixProvider,
        getCompleteMatrix,
        findNearestPoint,
        getGeographicDistance
    };
}

if (typeof window !== 'undefined') {
    window.RouteOptimizer = {
        optimizeRoute,
        calculateArrivalTimes,
        formatDuration,
        formatDistance,
        checkMatrixProviders,
        resetMatrixProvider,
        getCompleteMatrix,
        findNearestPoint,
        getGeographicDistance
    };
}