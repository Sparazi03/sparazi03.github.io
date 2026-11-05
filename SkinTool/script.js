// CONFIGURATION AND GLOBAL STATE

const API_BASE_URL = 'https://api.wolvesville.com';
const STORAGE_KEY = 'wolvesville_api_key';
const MAX_SLOTS = 54;
const DELAY_MS = 120;

let apiKey = localStorage.getItem(STORAGE_KEY) || '';


// DOM REFERENCES

const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const clearKeyBtn = document.getElementById('clear-key-btn');
const keyStatus = document.getElementById('key-status');

const nicknameInput = document.getElementById('nickname');
const searchBtn = document.getElementById('search-btn');
const searchStatus = document.getElementById('search-status');

const loadingContainer = document.getElementById('loading-container');
const progressFill = document.getElementById('progress-fill');

const resultsSection = document.getElementById('results-section');
const playerInfoDiv = document.getElementById('player-info');
const skinsGrid = document.getElementById('skins-grid');


function updateKeyStatus(msg, isError = false) {
    keyStatus.textContent = msg;
    keyStatus.className = `status-msg ${isError ? 'error' : 'success'}`;
    if (msg) {
        setTimeout(() => { keyStatus.textContent = ''; }, 4000);
    }
}

function updateSearchStatus(msg, isError = false) {
    searchStatus.textContent = msg;
    searchStatus.className = `status-msg ${isError ? 'error' : 'success'}`;
}

function getHeaders() {
    return {
        'Authorization': `Bot ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
}


// API KEY LOGIC

function initApiKey() {
    if (apiKey) {
        apiKeyInput.value = apiKey;
    }
}

saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        apiKey = key;
        localStorage.setItem(STORAGE_KEY, key);
        updateKeyStatus('API Key saved successfully.', false);
    } else {
        updateKeyStatus('This field cannot be empty.', true);
    }
});

clearKeyBtn.addEventListener('click', () => {
    apiKey = '';
    apiKeyInput.value = '';
    localStorage.removeItem(STORAGE_KEY);
    updateKeyStatus('API Key deleted.', false);
    resultsSection.style.display = 'none';
});


// PLAYER SEARCH

async function searchPlayer(username) {
    const url = `${API_BASE_URL}/players/search?username=${encodeURIComponent(username)}`;
    const response = await fetch(url, { headers: getHeaders() });

    if (!response.ok) {
        if (response.status === 401) throw new Error('Invalid or unauthorized API Key.');
        if (response.status === 404) return [];
        throw new Error(`API error (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();

    if (Array.isArray(data)) return data;

    if (data && typeof data === 'object' && data.id) return [data];

    if (data && typeof data === 'object') {
        for (const value of Object.values(data)) {
            if (Array.isArray(value)) return value;
        }
        for (const value of Object.values(data)) {
            if (value && typeof value === 'object' && value.id) return [value];
        }
        for (const value of Object.values(data)) {
            if (value && typeof value === 'object') {
                for (const inner of Object.values(value)) {
                    if (inner && typeof inner === 'object' && inner.id) return [inner];
                }
            }
        }
    }

    return [];
}

function findImageUrl(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 6) return null;
    for (const value of Object.values(obj)) {
        if (typeof value === 'string') {
            if (/^https?:\/\//i.test(value) &&
                /(avatar|skin|image|\.png|\.webp|\.jpg|\.jpeg|wolvesville)/i.test(value)) {
                return value;
            }
        } else if (value && typeof value === 'object') {
            const nested = findImageUrl(value, depth + 1);
            if (nested) return nested;
        }
    }
    return null;
}


// FETCH AVATAR DATA PER SLOT

async function getAvatarData(playerId, slot, retries = 3) {
    const sharedUrl = `${API_BASE_URL}/avatars/sharedAvatarId/${playerId}/${slot}`;

    try {
        const sharedRes = await fetch(sharedUrl, { headers: getHeaders() });

        if (sharedRes.status === 404) return null;

        if (sharedRes.status === 429) {
            if (retries > 0) {
                const wait = 500 * (4 - retries);
                console.warn(`Rate limit on slot ${slot}, waiting ${wait}ms...`);
                await new Promise(r => setTimeout(r, wait));
                return getAvatarData(playerId, slot, retries - 1);
            }
            console.warn(`Slot ${slot} discarded due to persistent rate limit.`);
            return null;
        }

        if (!sharedRes.ok) {
            if (retries > 0 && sharedRes.status >= 500) {
                await new Promise(r => setTimeout(r, 800));
                return getAvatarData(playerId, slot, retries - 1);
            }
            console.warn(`Slot ${slot} failed with status ${sharedRes.status}`);
            return null;
        }

        const contentType = sharedRes.headers.get('content-type') || '';
        let sharedAvatarId;

        if (contentType.includes('application/json')) {
            const sharedData = await sharedRes.json();
            if (typeof sharedData === 'string') {
                sharedAvatarId = sharedData;
            } else if (sharedData && typeof sharedData === 'object') {
                sharedAvatarId = sharedData.sharedAvatarId
                    || sharedData.id
                    || sharedData.avatarId
                    || Object.values(sharedData).find(v => typeof v === 'string');
            }
        } else {
            sharedAvatarId = await sharedRes.text();
        }

        if (!sharedAvatarId || typeof sharedAvatarId !== 'string') return null;
        sharedAvatarId = sharedAvatarId.replace(/['"]+/g, '').trim();
        if (!sharedAvatarId) return null;

        // Fetch avatar details
        const avatarUrl = `${API_BASE_URL}/avatars/${sharedAvatarId}`;
        const avatarRes = await fetch(avatarUrl, { headers: getHeaders() });

        let imageUrl = null;
        let avatarData = {};

        if (avatarRes.ok) {
            const ct = avatarRes.headers.get('content-type') || '';

            if (ct.startsWith('image/')) {
                imageUrl = avatarUrl;
            } else if (ct.includes('application/json')) {
                avatarData = await avatarRes.json();

                const candidates = [
                    avatarData.imageUrl,
                    avatarData.url,
                    avatarData.image,
                    avatarData.avatarUrl,
                    avatarData.skinUrl,
                    avatarData.previewUrl,
                    avatarData.sharedAvatarImageUrl,
                    avatarData.avatarImageUrl,
                    avatarData.imageURL,
                    avatarData.path
                ];
                imageUrl = candidates.find(v => typeof v === 'string' && v.length > 0);

                if (!imageUrl) {
                    imageUrl = findImageUrl(avatarData);
                }

                if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
                    imageUrl = imageUrl.startsWith('/')
                        ? `https://api.wolvesville.com${imageUrl}`
                        : `https://api.wolvesville.com/${imageUrl}`;
                }
            }
        }

        return {
            id: sharedAvatarId,
            slot: slot,
            url: imageUrl,
            code: sharedAvatarId,
            raw: avatarData
        };
    } catch (error) {
        if (retries > 0) {
            await new Promise(r => setTimeout(r, 800));
            return getAvatarData(playerId, slot, retries - 1);
        }
        console.warn(`Final error on slot ${slot}:`, error);
        return null;
    }
}


// LOAD SKINS

async function loadAllSkins(playerId) {
    const slots = Array.from({ length: MAX_SLOTS }, (_, i) => i);
    const allSkins = [];

    loadingContainer.classList.add('active');
    progressFill.style.width = '0%';

    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const skin = await getAvatarData(playerId, slot);

        if (skin !== null) {
            allSkins.push(skin);
        }

        const progress = ((i + 1) / MAX_SLOTS) * 100;
        progressFill.style.width = `${progress}%`;

        if (i < slots.length - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    loadingContainer.classList.remove('active');
    progressFill.style.width = '0%';

    if (allSkins.length === 0) {
        updateSearchStatus('No skins found on this profile.', true);
    } else {
        updateSearchStatus(`Found ${allSkins.length} skins.`, false);
    }

    allSkins.sort((a, b) => a.slot - b.slot);
    renderSkins(allSkins);
}


// SKIN RENDERING

function renderSkins(skins) {
    skinsGrid.innerHTML = '';

    if (skins.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `
            <div class="empty-title">No skins equipped</div>
            <div class="empty-text">This player has no skins equipped on any slot.</div>
        `;
        skinsGrid.appendChild(empty);
        return;
    }

    const placeholderSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNTAiIGhlaWdodD0iMTUwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzQ4NGY1OCIgc3Ryb2tlLXdpZHRoPSIxLjUiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjkiPjwvY2lyY2xlPjxwYXRoIGQ9Ik0xMiA4djQiPjwvcGF0aD48cGF0aCBkPSJNMTIgMTZoLjAxIj48L3BhdGg+PC9zdmc+';

    skins.forEach(skin => {
        const card = document.createElement('div');
        card.className = 'skin-card';

        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'skin-image-wrapper';

        const img = document.createElement('img');
        if (skin.url) {
            img.src = skin.url;
            img.onerror = () => {
                console.warn(`Failed to load image for slot ${skin.slot}:`, skin.url);
                img.src = placeholderSvg;
            };
        } else {
            img.src = placeholderSvg;
        }
        img.alt = `Skin slot ${skin.slot}`;
        img.loading = 'lazy';
        imageWrapper.appendChild(img);

        const slotSpan = document.createElement('span');
        slotSpan.className = 'skin-slot';
        slotSpan.textContent = `Slot ${skin.slot + 1}`;

        const codeDiv = document.createElement('div');
        codeDiv.className = 'skin-code';
        codeDiv.textContent = skin.code;
        codeDiv.title = 'Click to copy';
        codeDiv.addEventListener('click', () => {
            navigator.clipboard.writeText(skin.code).then(() => {
                const original = codeDiv.textContent;
                codeDiv.textContent = 'Copied';
                codeDiv.classList.add('copied');
                setTimeout(() => {
                    codeDiv.textContent = original;
                    codeDiv.classList.remove('copied');
                }, 1200);
            });
        });

        card.appendChild(imageWrapper);
        card.appendChild(slotSpan);
        card.appendChild(codeDiv);
        skinsGrid.appendChild(card);
    });
}

searchBtn.addEventListener('click', async () => {
    const username = nicknameInput.value.trim();

    if (!apiKey) {
        updateSearchStatus('You need to set up your API Key first.', true);
        return;
    }
    if (!username) {
        updateSearchStatus('Please enter a valid username.', true);
        return;
    }

    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';
    resultsSection.style.display = 'none';
    skinsGrid.innerHTML = '';
    playerInfoDiv.innerHTML = '';
    loadingContainer.classList.remove('active');
    progressFill.style.width = '0%';

    try {
        updateSearchStatus('Searching player...', false);
        const players = await searchPlayer(username);

        if (!players || players.length === 0) {
            updateSearchStatus(`No player found with nickname "${username}".`, true);
            return;
        }

        const player = players[0];
        const playerId = player.id;
        const playerName = player.username || username;

        if (!playerId) {
            console.error('Player object without ID:', JSON.stringify(player, null, 2));
            throw new Error('The API did not return a valid player ID.');
        }

        playerInfoDiv.textContent = playerName;
        resultsSection.style.display = 'block';
        updateSearchStatus('', false);

        await loadAllSkins(playerId);

    } catch (error) {
        console.error(error);
        updateSearchStatus(error.message || 'An unexpected error occurred.', true);
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search Skins';
    }
});

nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchBtn.click();
});


initApiKey();