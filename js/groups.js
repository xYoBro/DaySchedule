// groups.js — Group management panel

function openGroupsModal() {
  const modal = document.getElementById('groupsModalContent');
  renderGroupsModal(modal);
  openModal('groupsModal');
}

function renderGroupsModal(container) {
  const groups = Store.getGroups();
  let html = '<h2>Audience Groups</h2>';
  html += '<ul class="group-list">';
  groups.forEach(g => {
    html += '<div class="group-item" data-group-id="' + esc(g.id) + '">';
    html += '<input type="color" class="group-color-swatch" value="' + esc(g.color) + '" title="Color">';
    html += '<input type="text" class="group-name-input" value="' + esc(g.name) + '" placeholder="Group name">';
    html += '<button class="group-scope-toggle ' + (g.scope === 'main' ? 'main' : '') + '">' + (g.scope === 'main' ? 'Main' : 'Limited') + '</button>';
    html += '<button class="btn btn-danger" style="padding:3px 8px;font-size:11px;" onclick="removeGroupFromModal(\'' + esc(g.id) + '\')">Remove</button>';
    html += '</div>';
  });
  html += '</ul>';
  html += '<div style="margin-top:12px;display:flex;gap:8px;">';
  html += '<button class="btn" onclick="addGroupFromModal()">+ Add Group</button>';
  html += '<button class="btn btn-primary" onclick="saveGroupsFromModal()">Save</button>';
  html += '<button class="btn" onclick="closeModal(\'groupsModal\')">Cancel</button>';
  html += '</div>';
  container.innerHTML = html;

  // Wire up scope toggles
  container.querySelectorAll('.group-scope-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const isMain = btn.classList.contains('main');
      btn.classList.toggle('main', !isMain);
      btn.textContent = isMain ? 'Limited' : 'Main';
    });
  });
}

function addGroupFromModal() {
  const container = document.getElementById('groupsModalContent');
  const list = container.querySelector('.group-list');
  const newId = generateId('grp');
  const color = DEFAULT_COLOR_PALETTE[Store.getGroups().length % DEFAULT_COLOR_PALETTE.length];
  const itemHtml = '<div class="group-item" data-group-id="' + newId + '">'
    + '<input type="color" class="group-color-swatch" value="' + color + '" title="Color">'
    + '<input type="text" class="group-name-input" value="" placeholder="Group name">'
    + '<button class="group-scope-toggle">Limited</button>'
    + '<button class="btn btn-danger" style="padding:3px 8px;font-size:11px;" onclick="this.closest(\'.group-item\').remove()">Remove</button>'
    + '</div>';
  list.insertAdjacentHTML('beforeend', itemHtml);
  const newItem = list.lastElementChild;
  newItem.querySelector('.group-scope-toggle').addEventListener('click', function() {
    const isMain = this.classList.contains('main');
    this.classList.toggle('main', !isMain);
    this.textContent = isMain ? 'Limited' : 'Main';
  });
  newItem.querySelector('.group-name-input').focus();
}

function removeGroupFromModal(groupId) {
  const item = document.querySelector('.group-item[data-group-id="' + groupId + '"]');
  if (item) item.remove();
}

function saveGroupsFromModal() {
  saveUndoState();
  const container = document.getElementById('groupsModalContent');
  const items = container.querySelectorAll('.group-item');
  const newGroups = [];
  items.forEach(item => {
    const id = item.getAttribute('data-group-id');
    const name = item.querySelector('.group-name-input').value.trim();
    if (!name) return;
    const color = item.querySelector('.group-color-swatch').value;
    const scope = item.querySelector('.group-scope-toggle').classList.contains('main') ? 'main' : 'limited';
    newGroups.push({ id, name, scope, color });
  });
  // Clear existing groups and add new ones
  const currentGroups = Store.getGroups();
  currentGroups.slice().forEach(g => Store.removeGroup(g.id));
  newGroups.forEach(g => Store.addGroup(g));

  sessionSave();
  closeModal('groupsModal');
  renderActiveDay();
  toast('Groups updated');
}
