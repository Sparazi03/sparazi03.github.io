
        const API_BASE = 'https://api.wolvesville.com';

        let clansData = [];
        let currentClanId = null;
        let availableQuests = [];
        let questVotes = {};
        let clanMembers = new Map();
        let selectedQuestId = null;

        function getApiKey() {
            return document.getElementById('apiKey').value.trim();
        }

        function setLoading(elementId, message) {
            document.getElementById(elementId).innerHTML = `<div class="loading">${message}</div>`;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text == null ? '' : String(text);
            return div.innerHTML;
        }

        async function makeRequest(endpoint, method = 'GET', body = null) {
            const apiKey = getApiKey();
            if (!apiKey) {
                alert('Please enter your API key.');
                return null;
            }

            try {
                const options = {
                    method,
                    headers: {
                        'Authorization': `Bot ${apiKey}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    mode: 'cors'
                };

                if (body) {
                    options.body = JSON.stringify(body);
                }

                const response = await fetch(`${API_BASE}${endpoint}`, options);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status} - ${errorText}`);
                }

                const text = await response.text();
                return text ? JSON.parse(text) : {};
            } catch (error) {
                alert(`Request failed: ${error.message}`);
                return null;
            }
        }

        function extractQuestName(imageUrl) {
            if (!imageUrl) return 'Unknown Quest';
            try {
                const filename = imageUrl.split('/').pop().split('.')[0];
                const spaced = filename.replace(/[-_]+/g, ' ');
                return spaced.charAt(0).toUpperCase() + spaced.slice(1);
            } catch (error) {
                return 'Unknown Quest';
            }
        }

        function hiResUrl(url) {
            if (!url) return '';
            return url.replace(/\.png$/i, '@2x.png');
        }

        async function loadClans() {
            const container = document.getElementById('clansContainer');
            setLoading('clansContainer', 'Loading clans...');

            const data = await makeRequest('/clans/authorized');

            if (data === null) {
                container.innerHTML = '<div class="empty-message">Could not load clans. Check your API key and try again.</div>';
                return;
            }

            if (!Array.isArray(data) || data.length === 0) {
                clansData = [];
                container.innerHTML = '<div class="empty-message">No clans found. Make sure your bot has been added to a clan in the game.</div>';
                return;
            }

            clansData = data;
            renderClans();
        }

        function renderClans() {
            const container = document.getElementById('clansContainer');

            if (!clansData.length) {
                container.innerHTML = '<div class="empty-message">No clans found.</div>';
                return;
            }

            const grid = document.createElement('div');
            grid.className = 'clan-grid';

            clansData.forEach(clan => {
                const card = document.createElement('div');
                card.className = 'clan-card' + (clan.id === currentClanId ? ' selected' : '');
                card.innerHTML = `
                    <div class="clan-name">${escapeHtml(clan.name || 'Unnamed Clan')}</div>
                    <div class="clan-meta">
                        ${clan.tag ? `<span>Tag: ${escapeHtml(clan.tag)}</span>` : ''}
                        <span>Members: ${clan.memberCount != null ? clan.memberCount : '?'}</span>
                    </div>
                `;
                card.addEventListener('click', () => selectClan(clan.id));
                grid.appendChild(card);
            });

            container.innerHTML = '';
            container.appendChild(grid);
        }

        async function selectClan(clanId) {
            currentClanId = clanId;
            selectedQuestId = null;
            clanMembers.clear();
            availableQuests = [];
            questVotes = {};

            const clan = clansData.find(c => c.id === clanId);
            const subtitle = document.getElementById('clanSubtitle');
            subtitle.textContent = clan
                ? `Selected clan: ${clan.name}${clan.tag ? ` [${clan.tag}]` : ''}`
                : '';

            document.getElementById('controlsPanel').classList.remove('hidden');
            document.getElementById('questsPanel').classList.remove('hidden');
            document.getElementById('membersPanel').classList.remove('hidden');
            document.getElementById('enabledList').classList.add('hidden');
            updateStartButton();

            renderClans();
            await refreshClanData();
        }

        async function refreshClanData() {
            if (!currentClanId) return;

            setLoading('questsContainer', 'Loading quests...');
            setLoading('membersContainer', 'Loading members...');

            const [quests, votesData, members] = await Promise.all([
                makeRequest(`/clans/${currentClanId}/quests/available`),
                makeRequest(`/clans/${currentClanId}/quests/votes`),
                makeRequest(`/clans/${currentClanId}/members/detailed`)
            ]);

            availableQuests = Array.isArray(quests) ? quests : [];
            questVotes = votesData && votesData.votes ? votesData.votes : {};

            clanMembers.clear();
            if (Array.isArray(members)) {
                members.forEach(member => clanMembers.set(member.playerId, member));
            }

            if (selectedQuestId && !availableQuests.some(q => q.id === selectedQuestId)) {
                selectedQuestId = null;
            }

            renderQuests();
            renderMembers();
            updateStartButton();
        }

        function renderQuests() {
            const container = document.getElementById('questsContainer');

            if (!availableQuests.length) {
                container.innerHTML = '<div class="empty-message">No quests available for this clan right now.</div>';
                return;
            }

            const list = document.createElement('div');
            list.className = 'quest-list';

            availableQuests.forEach(quest => {
                const votes = questVotes[quest.id] || [];
                const votersCount = votes.length;
                const name = extractQuestName(quest.promoImageUrl);
                const isSelected = quest.id === selectedQuestId;

                const card = document.createElement('div');
                card.className = 'quest-card' + (isSelected ? ' selected' : '');

                const imageHtml = quest.promoImageUrl
                    ? `<img src="${escapeHtml(hiResUrl(quest.promoImageUrl))}" alt="${escapeHtml(name)}" class="quest-image">`
                    : '<div class="quest-image-placeholder">No image</div>';

                card.innerHTML = `
                    ${imageHtml}
                    <div class="quest-info">
                        <h3>${escapeHtml(name)}</h3>
                        <div class="badges">
                            <span class="badge badge-voters">Voters: ${votersCount}</span>
                            <span class="badge ${quest.purchasableWithGems ? 'badge-gems' : 'badge-gold'}">
                                ${quest.purchasableWithGems ? 'Gem Quest' : 'Gold Quest'}
                            </span>
                            ${isSelected ? '<span class="badge badge-selected">Selected</span>' : ''}
                        </div>
                    </div>
                    <div class="quest-actions">
                        <button class="btn-success btn-small enable-voters-btn">Enable Voters</button>
                    </div>
                `;

                card.querySelector('.enable-voters-btn').addEventListener('click', (event) => {
                    event.stopPropagation();
                    enableVotersForQuest(quest.id, name);
                });

                card.addEventListener('click', () => toggleSelectQuest(quest.id));

                list.appendChild(card);
            });

            container.innerHTML = '';
            container.appendChild(list);
        }

        function toggleSelectQuest(questId) {
            selectedQuestId = selectedQuestId === questId ? null : questId;
            renderQuests();
            updateStartButton();
        }

        function updateStartButton() {
            const btn = document.getElementById('startQuestBtn');
            if (selectedQuestId) {
                const quest = availableQuests.find(q => q.id === selectedQuestId);
                const name = quest ? extractQuestName(quest.promoImageUrl) : 'quest';
                btn.disabled = false;
                btn.textContent = `Start Selected Quest: ${name}`;
            } else {
                btn.disabled = true;
                btn.textContent = 'Select a quest to start';
            }
        }

        async function enableVotersForQuest(questId, questName) {
            const voters = questVotes[questId] || [];
            if (voters.length === 0) {
                alert('This quest has no voters yet.');
                return;
            }

            const toEnable = [];
            voters.forEach(playerId => {
                const member = clanMembers.get(playerId);
                if (member && !member.participateInClanQuests) {
                    toEnable.push(member);
                }
            });

            if (toEnable.length === 0) {
                alert('All voters of this quest are already enabled.');
                return;
            }

            if (!confirm(`Enable quest participation for ${toEnable.length} voter(s) of "${questName}"?`)) {
                return;
            }

            let successCount = 0;
            for (const member of toEnable) {
                const result = await makeRequest(
                    `/clans/${currentClanId}/members/${member.playerId}/participateInQuests`,
                    'PUT',
                    { participateInQuests: true }
                );
                if (result !== null) {
                    clanMembers.set(member.playerId, {
                        ...member,
                        participateInClanQuests: true
                    });
                    successCount++;
                }
            }

            renderQuests();
            renderMembers();

            alert(`Done. ${successCount} of ${toEnable.length} voter(s) have been enabled.`);
        }

        async function startSelectedQuest() {
            if (!selectedQuestId || !currentClanId) {
                alert('Please select a quest first.');
                return;
            }

            const quest = availableQuests.find(q => q.id === selectedQuestId);
            const name = quest ? extractQuestName(quest.promoImageUrl) : 'the selected quest';
            const currency = quest && quest.purchasableWithGems ? 'gems' : 'gold';

            if (!confirm(`Start the quest "${name}"? This will spend clan ${currency}.`)) {
                return;
            }

            const result = await makeRequest(`/clans/${currentClanId}/quests/claim`, 'POST', {
                questId: selectedQuestId
            });

            if (result === null) {
                alert('The quest could not be started.');
                return;
            }

            selectedQuestId = null;
            alert('Quest started successfully.');
            await refreshClanData();
        }

        async function disableAllParticipation() {
            if (!currentClanId) return;

            if (!confirm('Disable quest participation for ALL members of this clan?')) {
                return;
            }

            const result = await makeRequest(`/clans/${currentClanId}/members/all/participateInQuests`, 'PUT', {
                participateInQuests: false
            });

            if (result === null) {
                alert('Participation could not be disabled.');
                return;
            }

            if (Array.isArray(result)) {
                result.forEach(updated => {
                    const member = clanMembers.get(updated.playerId);
                    if (member) {
                        clanMembers.set(updated.playerId, {
                            ...member,
                            participateInClanQuests: false
                        });
                    }
                });
            } else {
                clanMembers.forEach((member, playerId) => {
                    clanMembers.set(playerId, { ...member, participateInClanQuests: false });
                });
            }

            renderQuests();
            renderMembers();

            alert('Quest participation has been disabled for all members.');
        }

        function getMemberStatusLabel(member) {
            if (member.status === 'INVITED') return 'Invited';
            if (member.status === 'JOIN_REQUESTED') return 'Join requested';
            return '';
        }

        function renderMembers() {
            const container = document.getElementById('membersContainer');
            const note = document.getElementById('membersNote');

            if (clanMembers.size === 0) {
                container.innerHTML = '<div class="empty-message">No members loaded for this clan.</div>';
                note.textContent = '';
                return;
            }

            const membersArray = Array.from(clanMembers.values()).sort((a, b) =>
                (a.username || '').localeCompare(b.username || '')
            );

            container.innerHTML = '';

            membersArray.forEach(member => {
                const item = document.createElement('div');
                item.className = 'member-item' + (member.participateInClanQuests ? ' is-enabled' : '');

                const pendingLabel = getMemberStatusLabel(member);

                item.innerHTML = `
                    <div class="member-info">
                        <div class="member-name">
                            ${escapeHtml(member.username || 'Unknown')}
                            ${member.isCoLeader ? '<span class="tag tag-leader">Co-leader</span>' : ''}
                            ${pendingLabel ? `<span class="tag tag-pending">${pendingLabel}</span>` : ''}
                            <span class="tag-state ${member.participateInClanQuests ? 'enabled' : 'disabled'}">
                                ${member.participateInClanQuests ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                    </div>
                    <div class="member-actions">
                        <button class="btn-small ${member.participateInClanQuests ? 'btn-danger' : 'btn-success'} toggle-member-btn">
                            ${member.participateInClanQuests ? 'Disable' : 'Enable'}
                        </button>
                    </div>
                `;

                item.querySelector('.toggle-member-btn').addEventListener('click', () => {
                    toggleMemberParticipation(member.playerId);
                });

                container.appendChild(item);
            });

            const enabledCount = membersArray.filter(m => m.participateInClanQuests).length;
            note.textContent = `${membersArray.length} member(s) loaded - ${enabledCount} enabled`;
        }

        async function toggleMemberParticipation(playerId) {
            const member = clanMembers.get(playerId);
            if (!member) {
                alert('Member not found.');
                return;
            }

            const newStatus = !member.participateInClanQuests;
            const action = newStatus ? 'Enable' : 'Disable';

            if (!confirm(`${action} quest participation for ${member.username || 'this member'}?`)) {
                return;
            }

            const result = await makeRequest(
                `/clans/${currentClanId}/members/${playerId}/participateInQuests`,
                'PUT',
                { participateInQuests: newStatus }
            );

            if (result === null) {
                alert('Participation could not be updated.');
                return;
            }

            clanMembers.set(playerId, {
                ...member,
                participateInClanQuests: newStatus
            });

            renderMembers();
        }

        function renderEnabledMembers() {
            const chips = document.getElementById('enabledChips');
            const title = document.getElementById('enabledListTitle');

            const enabled = Array.from(clanMembers.values())
                .filter(m => m.participateInClanQuests)
                .sort((a, b) => (a.username || '').localeCompare(b.username || ''));

            title.textContent = `Currently Enabled Members (${enabled.length})`;

            if (enabled.length === 0) {
                chips.innerHTML = '<span class="enabled-chip">No members are currently enabled</span>';
                return;
            }

            chips.innerHTML = enabled
                .map(m => `<span class="enabled-chip">${escapeHtml(m.username || 'Unknown')}</span>`)
                .join('');
        }

        document.getElementById('loadClansBtn').addEventListener('click', loadClans);

        document.getElementById('apiForm').addEventListener('submit', (event) => {
            event.preventDefault();
            loadClans();
        });

        document.getElementById('startQuestBtn').addEventListener('click', startSelectedQuest);

        document.getElementById('disableAllBtn').addEventListener('click', disableAllParticipation);

        document.getElementById('refreshBtn').addEventListener('click', async () => {
            if (!currentClanId) {
                alert('Select a clan first.');
                return;
            }
            await refreshClanData();
            alert('Data refreshed.');
        });

        document.getElementById('toggleEnabledListBtn').addEventListener('click', () => {
            const list = document.getElementById('enabledList');
            const btn = document.getElementById('toggleEnabledListBtn');
            const isHidden = list.classList.contains('hidden');

            if (isHidden) {
                renderEnabledMembers();
                list.classList.remove('hidden');
                btn.textContent = 'Hide Enabled Members';
            } else {
                list.classList.add('hidden');
                btn.textContent = 'Show Enabled Members';
            }
        });