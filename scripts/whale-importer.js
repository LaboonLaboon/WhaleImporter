// Whale Importer for Cyberpunk RED Foundry VTT
// File: modules/whale-importer/scripts/whale-importer.js

Hooks.once('ready', () => {
  console.log('🐋 Whale Importer | Ready – registering Actor Directory hook');
  Hooks.on('renderActorDirectory', (actorDirectory, html) => {
    console.log('🐋 Whale Importer | renderActorDirectory fired');
    // Prevent duplicate buttons
    if (html.find('.import-whale').length) return;
    // Append import button to footer
    const footer = html.find('.directory-footer');
    const btn = $(
      `<button class="import-whale btn">
         <i class="fas fa-file-import"></i> Import from Whale
       </button>`
    );
    btn.on('click', () => new WhaleImportDialog().render(true));
    footer.append(btn);
  });
});

// Validate top-level JSON structure
function validateEntity(data) {
  if (!data.entityType || !['Actor','Item','RollTable'].includes(data.entityType))
    throw new Error('Invalid entityType: ' + data.entityType);
  if (!data.name) throw new Error('Missing name');
  if (data.entityType === 'Item' && !data.type) throw new Error('Missing Item type');
  if (data.entityType === 'Actor' && !data.type) throw new Error('Missing Actor type');
}

// Map raw data to system schema for each item type
function mapItemData(type, raw) {
  const sys = {};
  // Universal fields
  if (raw.description)       sys.description        = { value: raw.description };
  if (raw.price != null)     sys.price              = { market: raw.price };
  if (raw.category)          sys.category           = raw.category;
  if (raw.quality)           sys.quality            = raw.quality;
  if (raw.revealed != null)  sys.revealed           = !!raw.revealed;
  if (raw.favorite != null)  sys.favorite           = !!raw.favorite;

  switch (type) {
    // WEAPON
    case 'weapon': {
      const skillMap = {
        SMG: 'Handgun', MediumPistol: 'Handgun', HeavyPistol: 'Handgun', AssaultRifle: 'Handgun',
        SniperRifle: 'Handgun', Shotgun: 'Handgun', Bow: 'Archery', ThrownWeapon: 'Archery',
        RocketLauncher: 'Heavy Weapon', GrenadeLauncher: 'Heavy Weapon',
        CombatKnife: 'Melee Weapon', BaseballBat: 'Melee Weapon', Tomahawk: 'Melee Weapon'
      };
      const ammoMap = {
        paintball: 'paintball', rifle: 'rifle', arrow: 'arrow', shotgunShell: 'shotgunShell',
        shotgunSlug: 'shotgunSlug', grenade: 'grenade', heavyPistol: 'heavyPistol',
        vHeavyPistol: 'vHeavyPistol', medPistol: 'medPistol', battery: 'battery',
        rocket: 'rocket', customAmmo: 'customAmmo'
      };
      sys.weapon = {
        attackmod: raw.attackmod || 0,
        rof: raw.rof,
        damage: raw.damage,
        ammoVariety: raw.ammoType ? [ammoMap[ raw.ammoType.replace(/\s+/g,'') ] || raw.ammoType] : [],
        brand: raw.brand || '',
        concealable: { concealable: !!raw.conceal, isConcealed: false },
        critFailEffect: raw.special || '',
        dvTable: raw.dvTable || '',
        equipped: raw.equipped || 'owned',
        favorite: raw.favorite || false,
        fireModes: { autoFire: raw.autofire || 0, suppressiveFire: !!raw.suppressive },
        handsReq: raw.handsRequired || 1,
        installedItems: { allowed: true, allowedTypes: ['itemUpgrade','ammo'], list: [], slots: raw.slots || 0, usedSlots: 0 },
        isRanged: !!raw.rangedWeapon,
        magazine: { max: raw.magazine || 0, value: raw.loadedAmmo || 0 },
        price: { market: raw.price || 0 },
        quality: raw.quality || raw.rarity || 'standard',
        source: raw.source || { book: 'Core', page: 0 },
        unarmedAutomaticCalculation: raw.unarmedAutomaticCalculation ?? true,
        usage: raw.usage || 'equipped',
        usesType: raw.usesType || 'magazine',
        weaponSkill: skillMap[ raw.skill ] || raw.skill,
        weaponType: (raw.weaponType || '').toLowerCase().replace(/\s+/g,'_'),
        description: sys.description
      };
      break;
    }
    // ARMOR
    case 'armor': {
      sys.bodyLocation = { sp: raw.spBody ?? raw.sp ?? 0, ablation: raw.ablationBody || 0 };
      sys.headLocation = { sp: raw.spHead || 0, ablation: raw.ablationHead || 0 };
      sys.brand = raw.brand || '';
      sys.concealable = { concealable: !!raw.conceal, isConcealed: false };
      sys.equipped = raw.equipped || 'owned';
      sys.favorite = raw.favorite || false;
      sys.installedItems = { allowed: true, allowedTypes: ['itemUpgrade'], list: [], slots: raw.slots || 0, usedSlots: 0 };
      sys.isBodyLocation = raw.isBodyLocation ?? true;
      sys.isHeadLocation = raw.isHeadLocation ?? false;
      sys.isShield = raw.isShield ?? false;
      sys.shieldHitPoints = { max: raw.shieldMax || 0, value: raw.shieldValue || 0 };
      sys.penalty = raw.penalty || 0;
      sys.price = { market: raw.price || 0 };
      sys.quality = raw.quality || 'standard';
      sys.revealed = raw.revealed ?? true;
      sys.source = raw.source || { book: 'Core', page: 0 };
      sys.usage = raw.usage || 'equipped';
      break;
    }
    // CLOTHING
    case 'clothing': {
      sys.clothing = { amount: raw.amount || 1, brand: raw.brand || '', concealable: { concealable: !!raw.conceal, isConcealed: false }, description: sys.description, isElectronic: !!raw.electronic, providesHardening: !!raw.providesHardening };
      sys.equipped = raw.equipped || 'owned';
      sys.favorite = raw.favorite || false;
      sys.installedItems = { allowed: true, allowedTypes: ['itemUpgrade'], list: raw.installedItems?.list || [], slots: raw.installedItems?.slots ?? raw.slots || 0, usedSlots: raw.installedItems?.usedSlots || 0 };
      sys.price = { market: raw.price || 0 };
      sys.quality = raw.quality || 'standard';
      sys.revealed = raw.revealed ?? true;
      sys.source = raw.source || { book: 'Core', page: 0 };
      sys.style = raw.style || raw.category || '';
      sys.type = raw.type || '';
      sys.usage = raw.usage || 'equipped';
      break;
    }
    // CYBERWARE
    case 'cyberware': {
      sys.cyberware = {
        attackmod: raw.attackmod || 0,
        rof: raw.rof || 0,
        damage: raw.damage || '',
        ammoVariety: raw.ammoType ? [ raw.ammoType ] : [],
        brand: raw.brand || '',
        concealable: { concealable: !!raw.conceal, isConcealed: false },
        critFailEffect: raw.special || '',
        dvTable: raw.dvTable || '',
        equipped: raw.equipped || 'owned',
        favorite: raw.favorite || false,
        fireModes: { autoFire: raw.autofire || 0, suppressiveFire: !!raw.suppressive },
        handsReq: raw.handsRequired || 1,
        humanityLoss: { roll: raw.humanityRoll || '', static: raw.humanityStatic || 0 },
        installedItems: { allowed: true, allowedTypes: ['itemUpgrade','program'], list: [], slots: raw.slots || 0, usedSlots: 0 },
        isElectronic: !!raw.electronic,
        isRanged: !!raw.isRanged,
        isWeapon: !!raw.isWeapon,
        magazine: { max: raw.magazine || 0, value: raw.loadedAmmo || 0 },
        price: { market: raw.price || 0 },
        providesHardening: !!raw.providesHardening,
        quality: raw.quality || 'standard',
        revealed: raw.revealed ?? true,
        size: raw.size || 0,
        source: raw.source || { book: 'Core', page: 0 },
        unarmedAutomaticCalculation: raw.unarmedAutomaticCalculation ?? true,
        usage: raw.usage || 'installed',
        usesType: raw.usesType || 'magazine',
        weaponSkill: raw.weaponSkill || '',
        weaponType: raw.weaponType || ''
      };
      break;
    }
    // UPGRADE
    case 'upgrade': {
      sys.upgrade = {
        attackmod: raw.attackmod || 0,
        damage: raw.damage || '',
        dvTable: raw.dvTable || '',
        ammoVariety: raw.ammoVariety || [],
        brand: raw.brand || '',
        concealable: { concealable: !!raw.conceal, isConcealed: false },
        description: sys.description,
        equipped: raw.equipped || 'owned',
        favorite: raw.favorite || false,
        fireModes: { autoFire: raw.autofire || 0, suppressiveFire: !!raw.suppressive },
        handsReq: raw.handsRequired || 0,
        installLocation: raw.installLocation || '',
        installedItems: { allowed: true, allowedTypes: ['itemUpgrade'], list: [], slots: raw.slots || 0, usedSlots: 0 },
        isElectronic: !!raw.electronic,
        magazine: { max: raw.magazine || 0, value: raw.loadedAmmo || raw.ammo || 0 },
        modifiers: raw.modifiers || {},
        price: { market: raw.price || 0 },
        providesHardening: !!raw.providesHardening,
        quality: raw.quality || 'standard',
        revealed: raw.revealed ?? true,
        rof: raw.rof || 0,
        size: raw.size || 0,
        source: raw.source || { book: 'Core', page: 0 },
        unarmedAutomaticCalculation: raw.unarmedAutomaticCalculation ?? true,
        usage: raw.usage || 'equipped',
        usesType: raw.usesType || 'magazine',
        weaponSkill: raw.weaponSkill || '',
        weaponType: raw.weaponType || ''
      };
      break;
    }
    // GEAR
    case 'gear': {
      sys.gear = {
        brand: raw.brand || '',
        concealable: { concealable: !!raw.conceal, isConcealed: false },
        description: sys.description,
        equipped: raw.equipped || 'owned',
        favorite: raw.favorite || false,
        installLocation: raw.installLocation || '',
        installedItems: { allowed: true, allowedTypes: ['itemUpgrade','program'], list: [], slots: raw.slots || 0, usedSlots: 0 },
        isElectronic: !!raw.electronic,
        price: { market: raw.price || 0 },
        providesHardening: !!raw.providesHardening,
        quality: raw.quality || 'standard',
        revealed: raw.revealed ?? true,
        size: raw.size || 0,
        source: raw.source || { book: 'Core', page: 0 }
      };
      break;
    }
    // DRUG
    case 'drug': {
      sys.drug = {
        rating: raw.rating || 0,
        addictionCheck: raw.addictionCheck || 0,
        cumulative: raw.cumulative ?? false,
        description: sys.description,
        price: { market: raw.price || 0 }
      };
      break;
    }
    // PROGRAM
    case 'program': {
      sys.program = {
        programSize: raw.programSize,
        class: raw.class,
        atk: raw.ATK,
        def: raw.DEF,
        rez: raw.REZ,
        description: sys.description,
        price: { market: raw.price || 0 }
      };
      break;
    }
    // ARCHITECTURE
    case 'architecture': {
      sys.architecture = {
        layers: raw.layers,
        dv: raw.DV,
        description: sys.description,
        price: { market: raw.price || 0 }
      };
      break;
    }
    // CRITICAL INJURY
    case 'critical': {
      sys.critical = {
        location: raw.location,
        quickFixType: raw.quickFixType,
        quickFixDV: raw.quickFixDV,
        treatmentType: raw.treatmentType,
        treatmentDV: raw.treatmentDV,
        increasesDeathSave: !!raw.increasesDeathSave,
        description: sys.description
      };
      break;
    }
    // AMMO
    case 'ammo': {
      sys.ammo = {
        amount: raw.amount ?? 1,
        quantity: raw.quantity ?? raw.amount ?? 1,
        variety: raw.variety || '',
        type: raw.type || '',
        ablationAmount: raw.ablationAmount || 0,
        modifyDamage: !!raw.modifyDamage,
        modifyAutofireMax: !!raw.modifyAutofireMax,
        price: { market: raw.price || 0 }
      };
      break;
    }
    // VEHICLE
    case 'vehicle': {
      sys.vehicle = {
        structuralDamagePoints: raw.structuralDamagePoints || 0,
        seats: raw.seats || 0,
        combatSpeed: raw.combatSpeed || 0,
        speedNarrative: raw.speedNarrative || ''
      };
      sys.installedItems = { allowed: true, allowedTypes: ['itemUpgrade','weapon'], list: [], slots: raw.slots || 0, usedSlots: 0 };
      sys.price = { market: raw.price || 0 };
      sys.quality = raw.quality || 'standard';
      sys.revealed = raw.revealed ?? true;
      break;
    }
    // SKILL
    case 'skill': {
      sys.skill = {
        category: raw.category,
        difficulty: raw.difficulty,
        basic: !!raw.basic,
        level: raw.level,
        stat: raw.stat,
        description: sys.description
      };
      break;
    }
    // ROLE
    case 'role': {
      sys.role = {
        abilities: raw.abilities || [],
        bonusRatio: raw.bonusRatio ?? 1,
        bonuses: raw.bonuses || [],
        addRoleAbilityRank: !!raw.addRoleAbilityRank,
        hasRoll: !!raw.hasRoll,
        isSituational: !!raw.isSituational,
        rank: raw.rank || 0,
        onByDefault: !!raw.onByDefault,
        universalBonuses: raw.universalBonuses || [],
        stat: raw.stat || '',
        skill: raw.skill || '',
        description: sys.description,
        favorite: raw.favorite || false,
        revealed: raw.revealed ?? true,
        source: raw.source || { book: 'Core', page: 0 }
      };
      break;
    }
    // CYBERDECK
    case 'cyberdeck': {
      sys.cyberdeck = {
        brand: raw.brand || '',
        concealable: { concealable: !!raw.conceal, isConcealed: false },
        description: sys.description,
        equipped: raw.equipped || 'owned',
        favorite: raw.favorite || false,
        installLocation: raw.installLocation || '',
        installedItems: { allowed: true, allowedTypes: ['itemUpgrade','program'], list: [], slots: raw.slots||0, usedSlots:0 },
        isElectronic: !!raw.electronic,
        price: { market: raw.price || 0 },
        providesHardening: !!raw.providesHardening,
        quality: raw.quality || 'standard',
        revealed: raw.revealed ?? true,
        size: raw.size || 0,
        source: raw.source || { book: 'Core', page: 0 }
      };
      break;
    }
  }
  return sys;
}

// Import processor
async function processImportPayload(raw) {
  const entries = Array.isArray(raw) ? raw : [raw];
  for (const e of entries) {
    validateEntity(e);
    if (e.entityType === 'Item') {
      const systemData = mapItemData(e.type, e.data || {});
      await Item.create({ name: e.name, type: e.type, system: systemData, img: e.img });
    } else if (e.entityType === 'Actor') {
      const actor = await Actor.create({ name: e.name, type: e.type, system: { stats: e.data.stats, role: e.data.role, reputation: e.data.reputation || 0 }, img: e.img });
      const items = [];
      (e.data.weapons || []).forEach(w => items.push({ type: 'weapon', name: w.name, data: w, img: w.img }));
      if (e.data.armor) items.push({ type: 'armor', name: e.data.armor.name, data: e.data.armor, img: e.data.armor.img });
      ['gear','cyberware','upgrade','program','architecture','vehicle','clothing','critical','skill','role','cyberdeck','ammo'].forEach(key => {
        (e.data[key] || []).forEach(i => items.push({ type: key, name: i.name || i, data: i, img: i.img }));
      });
      const embedded = items.map(i => ({ name: i.name, type: i.type, system: mapItemData(i.type, i.data || {}), img: i.img }));
      await actor.createEmbeddedDocuments('Item', embedded);
      if (e.data.skills) await actor.update({ 'system.skills': e.data.skills });
    } else if (e.entityType === 'RollTable') {
      await RollTable.create({ name: e.name, img: e.img, results: e.results });
    }
  }
  ui.notifications.info('🐋 Whale Importer | Import complete');
}

// Import dialog UI
class WhaleImportDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, { id: 'whale-importer-dialog', title: 'Import from Whale', template: 'modules/whale-importer/templates/import-dialog.html', width: 600, closeOnSubmit: true });
  }
  getData() { return {}; }
  async _updateObject(event) {
    const raw = this.element.find('textarea[name="json-input"]').val();
    try { const payload = JSON.parse(raw); await processImportPayload(payload); }
    catch (err) { ui.notifications.error('Import failed: ' + err.message); }
  }
}