Hooks.once('init', () => {
  console.log("Whale Importer | Initializing");
});

Hooks.once('ready', () => {
  // Add import button to Actors directory footer
  const actorDir = ui.actors;
  const footer = actorDir.element.find('.directory-footer');
  const btn = $("<button class='import-whale btn'><i class='fas fa-file-import'></i> Import from Whale</button>");
  btn.on('click', () => new WhaleImportDialog().render(true));
  footer.prepend(btn);

  // Listen for direct messages from The Whale UI
  window.addEventListener('message', async event => {
    if (event.origin !== 'https://chatgpt.com') return;
    const payload = event.data?.whaleImport;
    if (!payload) return;
    try {
      await processImportPayload(payload);
      ui.notifications.info('Imported data from The Whale directly');
    } catch (err) {
      ui.notifications.error(`Direct import failed: ${err.message}`);
    }
  });
});

function validateEntity(data) {
  if (!data.type || !['Actor','Item','RollTable'].includes(data.type))
    throw new Error('Missing or invalid `type` (must be Actor, Item, or RollTable)');
  if (!data.name || typeof data.name !== 'string')
    throw new Error('Missing or invalid `name`');
  switch (data.type) {
    case 'Actor': {
      const valid = Object.keys(CONFIG.Actor.typeLabels || {});
      if (!data.data?.type || !valid.includes(data.data.type))
        throw new Error(`Invalid Actor subtype: ${data.data?.type}`);
      break;
    }
    case 'Item': {
      const valid = Object.keys(CONFIG.Item.typeLabels || {});
      if (!data.data?.type || !valid.includes(data.data.type))
        throw new Error(`Invalid Item subtype: ${data.data?.type}`);
      break;
    }
    case 'RollTable': {
      if (!Array.isArray(data.results))
        throw new Error('RollTable missing `results` array');
      break;
    }
  }
}

async function processImportPayload(payload) {
  const items = Array.isArray(payload) ? payload : [payload];
  for (const data of items) {
    validateEntity(data);
    switch (data.type) {
      case 'Actor':
        await Actor.create(data, { renderSheet: true });
        break;
      case 'Item':
        await Item.create(data);
        break;
      case 'RollTable':
        await RollTable.create(data);
        break;
    }
    console.log(`Whale Importer | Imported ${data.type}: ${data.name}`);
  }
}

class WhaleImportDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'whale-importer-dialog',
      title: 'Import from The Whale',
      template: 'modules/whale-importer/templates/import-dialog.html',
      width: 600
    });
  }
  getData() { return {}; }
  async _updateObject(event, formData) {
    const raw = this.element.find('textarea[name="json-input"]').val().trim();
    let payload;
    try { payload = JSON.parse(raw); }
    catch { return ui.notifications.error('Invalid JSON format'); }
    try {
      await processImportPayload(payload);
      ui.notifications.info('Imported pasted data successfully');
    } catch (err) {
      ui.notifications.error(`Import failed: ${err.message}`);
    }
    this.close();
  }
}