Hooks.once('init', () => {
  console.log("Whale Importer | Initializing");
});

// Add import button whenever the Actor directory is rendered
Hooks.on('renderActorDirectory', (app, html) => {
  if (html.find('.import-whale').length) return;
  const footer = html.find('.directory-footer');
  const btn = $(
    `<button class='import-whale btn'>
      <i class='fas fa-file-import'></i> Import from Whale
    </button>`
  );
  btn.on('click', () => new WhaleImportDialog().render(true));
  footer.prepend(btn);
});

// Listen for direct exports from The Whale UI
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

/** Validate JSON structure and subtype */
function validateEntity(data) {
  if (!data.entityType || !['Actor','Item','RollTable'].includes(data.entityType))
    throw new Error('Missing or invalid `entityType` (must be Actor, Item, or RollTable)');
  if (!data.name) throw new Error('Missing `name`');
}

/**
 * Process and import entities, using default Foundry icons if img is omitted.
 */
async function processImportPayload(raw) {
  const entries = Array.isArray(raw) ? raw : [raw];
  for (const data of entries) {
    validateEntity(data);
    const docType = data.entityType;

    // Build createData, omitting img if not provided so Foundry uses its default
    let createData = { name: data.name };
    if (data.img) createData.img = data.img;

    if (docType === 'Item') {
      createData.type = data.data.type;
      const itemData = { ...data.data };
      delete itemData.type;
      createData.data = itemData;
      await Item.create(createData);
    }
    else if (docType === 'Actor') {
      createData.type = data.data.type;
      const actorData = { ...data.data };
      delete actorData.type;
      createData.token = data.token || {};
      createData.data = actorData;
      await Actor.create(createData, { renderSheet: true });
    }
    else if (docType === 'RollTable') {
      createData.results = data.results;
      await RollTable.create(createData);
    }

    console.log(`Whale Importer | Created ${docType}: ${data.name}`);
  }
}

class WhaleImportDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'whale-importer-dialog',
      title: 'Import from The Whale',
      template: 'modules/whale-importer/templates/import-dialog.html',
      width: 600,
      closeOnSubmit: true
    });
  }

  getData() { return {}; }

  /** Handle form submission */
  async _updateObject(event, formData) {
    const raw = this.element.querySelector('textarea[name="json-input"]').value;
    let payload;
    try { payload = JSON.parse(raw); }
    catch { return ui.notifications.error('Invalid JSON'); }
    try {
      await processImportPayload(payload);
      ui.notifications.info('Imported pasted data');
    } catch (err) {
      ui.notifications.error(`Import failed: ${err.message}`);
    }
  }
}