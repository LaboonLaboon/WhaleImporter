// Initialize module
Hooks.once('init', () => console.log("Whale Importer | Initializing v1.5.1"));

// Add Import button to the Actors directory
Hooks.on('renderActorDirectory', (app, html) => {
  // Prevent duplicates
  if (html.find('.import-whale').length) return;
  // Insert button into the directory footer
  const footer = html.find('.directory-footer');
  const btn = $(
    `<button class="import-whale btn"><i class="fas fa-file-import"></i> Import from Whale</button>`
  );
  btn.on('click', () => new WhaleImportDialog().render(true));
  footer.append(btn);
});

/** Validate basic JSON structure */
function validateEntity(data) {
  if (!data.entityType || !['Actor','Item','RollTable'].includes(data.entityType))
    throw new Error('Invalid entityType');
  if (!data.name) throw new Error('Missing name');
  if (data.entityType === 'Item' && !data.type) throw new Error('Missing Item type');
  if (data.entityType === 'Actor' && !data.type) throw new Error('Missing Actor type');
}

/** Map raw JSON fields into CPR core schema */
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
    case 'weapon': {
      const skillMap = {
        SMG: 'Handgun', MediumPistol: 'Handgun', HeavyPistol: 'Handgun',
        AssaultRifle: 'Handgun', SniperRifle: 'Handgun', Shotgun: 'Handgun',
        Bow: 'Archery', ThrownWeapon: 'Archery',
        RocketLauncher: 'Heavy Weapon', GrenadeLauncher: 'Heavy Weapon',
        CombatKnife: 'Melee Weapon', BaseballBat: 'Melee Weapon', Tomahawk: 'Melee Weapon'
      };
      const ammoMap = {
        paintball: 'paintball', rifle: 'rifle', arrow: 'arrow',
        shotgunShell: 'shotgunShell', shotgunSlug: 'shotgunSlug', grenade: 'grenade',
        heavyPistol: 'heavyPistol', vHeavyPistol: 'vHeavyPistol', medPistol: 'medPistol',
        battery: 'battery', rocket: 'rocket', customAmmo: 'customAmmo'
      };
      sys.weapon = {
        attackmod:  raw.attackmod ?? 0,
        rof:        raw.rof,
        damage:     raw.damage,
        ammoVariety: raw.ammoType ? [ ammoMap[ raw.ammoType.replace(/\s+/g,'') ] || raw.ammoType ] : [],
        brand:      raw.brand || '',
        concealable:{ concealable: !!raw.conceal, isConcealed: false },
        critFailEffect: raw.special || '',
        dvTable:    raw.dvTable || '',
        equipped:   raw.equipped || 'owned',
        favorite:   raw.favorite ?? false,
        fireModes:  { autoFire: raw.autofire || 0, suppressiveFire: !!raw.suppressive },
        handsReq:   raw.handsRequired,
        installedItems: {
          allowed: true,
          allowedTypes: ['itemUpgrade','ammo'],
          list: [],
          slots: raw.slots || 0,
          usedSlots: 0
        },
        isRanged:   !!raw.rangedWeapon,
        magazine:   { max: raw.magazine||0, value: raw.loadedAmmo||0 },
        price:      { market: raw.price||0 },
        quality:    raw.quality || raw.rarity || 'standard',
        revealed:   raw.revealed ?? true,
        source:     raw.source || { book:'Core', page:0 },
        unarmedAutomaticCalculation: raw.unarmedAutomaticCalculation ?? true,
        usage:      raw.usage || 'equipped',
        usesType:   raw.usesType || 'magazine',
        weaponSkill: skillMap[ raw.skill ] || raw.skill,
        weaponType:  (raw.weaponType || '').toLowerCase().replace(/\s+/g,'_'),
        description: sys.description
      };
      break;
    }

    case 'armor': {
      sys.bodyLocation = { sp: raw.spBody ?? raw.sp ?? 0, ablation: raw.ablationBody || 0 };
      sys.headLocation = { sp: raw.spHead || 0, ablation: raw.ablationHead || 0 };
      sys.brand               = raw.brand || '';
      sys.concealable         = { concealable: !!raw.conceal, isConcealed: false };
      sys.equipped            = raw.equipped || 'owned';
      sys.favorite            = raw.favorite ?? false;
      sys.installedItems      = { allowed: true, allowedTypes: ['itemUpgrade'], list: [], slots: raw.slots || 0, usedSlots: 0 };
      sys.isShield            = raw.isShield ?? false;
      sys.shieldHitPoints     = { max: raw.shieldMax || 0, value: raw.shieldValue || 0 };
      sys.penalty             = raw.penalty || 0;
      sys.price               = { market: raw.price || 0 };
      sys.quality             = raw.quality || 'standard';
      sys.revealed            = raw.revealed ?? true;
      sys.source              = raw.source || { book:'Core', page:0 };
      sys.usage               = raw.usage || 'equipped';
      break;
    }

    case 'clothing': {
      sys.clothing = { amount: raw.amount || 1, brand: raw.brand || '', concealable: { concealable: !!raw.conceal, isConcealed: false }, description: { value: raw.description || '' }, isElectronic: !!raw.electronic, providesHardening: !!raw.providesHardening };
      sys.equipped = raw.equipped || 'owned';
      sys.favorite = raw.favorite ?? false;
      sys.installedItems = { allowed:true, allowedTypes:['itemUpgrade'], list: raw.installedItems?.list||[], slots: raw.installedItems?.slots??raw.slots||0, usedSlots: raw.installedItems?.usedSlots||0 };
      sys.price    = { market: raw.price||0 };
      sys.quality  = raw.quality || 'standard';
      sys.revealed = raw.revealed ?? true;
      sys.source   = raw.source || { book:'Core', page:0 };
      sys.usage    = raw.usage || 'equipped';
      break;
    }

    case 'cyberware': {
      sys.cyberware = {
        attackmod: raw.attackmod||0, brand:raw.brand||'', concealable:{concealable:!!raw.conceal,isConcealed:false}, damage: raw.damage||'', critFailEffect:raw.special||'', dvTable:raw.dvTable||'', equipped:raw.equipped||'owned', favorite:raw.favorite??false,
        fireModes:{autoFire:raw.autofire||0,suppressiveFire:!!raw.suppressive}, handsReq:raw.handsRequired||1, humanityLoss:{roll:raw.humanityRoll||'',static:raw.humanityStatic||0},
        installedItems:{allowed:true,allowedTypes:['itemUpgrade','program'],list:[],slots:raw.slots||0,usedSlots:0}, isElectronic:!!raw.electronic,isRanged:!!raw.isRanged,isWeapon:!!raw.isWeapon,
        magazine:{max:raw.magazine||0,value:raw.loadedAmmo||0}, modifiers:raw.modifiers||{}, price:{market:raw.price||0}, providesHardening:!!raw.providesHardening,
        quality:raw.quality||'standard', revealed:raw.revealed??true, rof:raw.rof||0, size:raw.size||0, source:raw.source||{book:'Core',page:0},
        unarmedAutomaticCalculation:raw.unarmedAutomaticCalculation??true, usage:raw.usage||'installed', usesType:raw.usesType||'magazine', weaponSkill:raw.weaponSkill||'', weaponType:raw.weaponType||''
      };
      break;
    }

    case 'upgrade': {
      sys.upgrade = {
        attackmod:raw.attackmod||0, brand:raw.brand||'', concealable:{concealable:!!raw.conceal,isConcealed:false}, damage:raw.damage||'', dvTable:raw.dvTable||'',
        description:{value:raw.description||''}, equipped:raw.equipped||'owned', favorite:raw.favorite??false,
        fireModes:{autoFire:raw.autofire||0,suppressiveFire:!!raw.suppressive}, handsReq:raw.handsRequired||0, installLocation:raw.installLocation||'',
        installedItems:{allowed:true,allowedTypes:['itemUpgrade'],list:raw.installedItems?.list||[],slots:raw.installedItems?.slots??raw.slots||0,usedSlots:raw.installedItems?.usedSlots||0},
        isElectronic:!!raw.electronic, magazine:{max:raw.magazine||0,value:raw.loadedAmmo||raw.ammo||0}, modifiers:raw.modifiers||{}, price:{market:raw.price||0},
        providesHardening:!!raw.providesHardening, quality:raw.quality||'standard', revealed:raw.revealed??true, rof:raw.rof||0, size:raw.size||0, source:raw.source||{book:'Core',page:0},
        unarmedAutomaticCalculation:raw.unarmedAutomaticCalculation??true, usage:raw.usage||'equipped', usesType:raw.usesType||'magazine', weaponSkill:raw.weaponSkill||'', weaponType:raw.weaponType||''
      };
      break;
    }

    case 'gear': {
      sys.gear = {
        brand:raw.brand||'', concealable:{concealable:!!raw.conceal,isConcealed:false}, description:{value:raw.description||''},
        equipped:raw.equipped||'owned', favorite:raw.favorite??false, installLocation:raw.installLocation||'',
        installedItems:{allowed:true,allowedTypes:['itemUpgrade','program'],list:raw.installedItems?.list||[],slots:raw.installedItems?.slots??raw.slots||0,usedSlots:raw.installedItems?.usedSlots||0},
        isElectronic:!!raw.electronic, price:{market:raw.price||0}, providesHardening:!!raw.providesHardening,
        quality:raw.quality||'standard', revealed:raw.revealed??true, size:raw.size||0, source:raw.source||{book:'Core',page:0}
      };
      break;
    }

    case 'drug': {
      sys.drug = { rating:raw.rating||0, addictionCheck:raw.addictionCheck||0, cumulative:raw.cumulative||false, description:{value:raw.description||''}, price:{market:raw.price||0} };
      break;
    }

    case 'program': {
      sys.program = { programSize:raw.programSize, class:raw.class, atk:raw.ATK, def:raw.DEF, rez:raw.REZ, description:{value:raw.description||''}, price:{market:raw.price||0} };
      break;
    }

    case 'architecture': {
      sys.architecture = { layers:raw.layers, dv:raw.DV, description:{value:raw.description||''}, price:{market:raw.price||0} };
      break;
    }

    case 'critical': {
      sys.critical = { location:raw.location, quickFixType:raw.quickFixType, quickFixDV:raw.quickFixDV, treatmentType:raw.treatmentType, treatmentDV:raw.treatmentDV, increasesDeathSave:!!raw.increasesDeathSave, description:{value:raw.description||''} };
      break;
    }

    case 'ammo': {
      sys.ammo = { amount:raw.amount??1, quantity:raw.quantity??raw.amount??1, variety:raw.variety||'', type:raw.type||'', ablationAmount:raw.ablationAmount||0, modifyDamage:!!raw.modifyDamage, modifyAutofireMax:!!raw.modifyAutofireMax, price:{market:raw.price||0} };
      break;
    }

    case 'vehicle': {
      sys.vehicle = { structuralDamagePoints:raw.structuralDamagePoints||0, seats:raw.seats||0, combatSpeed:raw.combatSpeed||0, speedNarrative:raw.speedNarrative||'', installedItems:{allowed:true,allowedTypes:['itemUpgrade','weapon'],list:[],slots:raw.slots||0,usedSlots:0}, price:{market:raw.price||0}, quality:raw.quality||'standard', revealed:raw.revealed??true };
      break;
    }

    case 'skill': {
      sys.skill = { category:raw.category, difficulty:raw.difficulty, basic:!!raw.basic, level:raw.level, stat:raw.stat, description:{value:raw.description||''} };
      break;
    }

    case 'role': {
      sys.role = { abilities:raw.abilities||[], bonusRatio:raw.bonusRatio||1, bonuses:raw.bonuses||[], addRoleAbilityRank:!!raw.addRoleAbilityRank, hasRoll:!!raw.hasRoll, isSituational:!!raw.isSituational, universalBonuses:raw.universalBonuses||[], rank:raw.rank||0, onByDefault:!!raw.onByDefault, stat:raw.stat||'', skill:raw.skill||'', description:{value:raw.description||''}, favorite:raw.favorite??false, revealed:raw.revealed??true };
      break;
    }

    case 'cyberdeck': {
      sys.cyberdeck = { brand:raw.brand||'', concealable:{concealable:!!raw.conceal,isConcealed:false}, electronic:!!raw.electronic, providesHardening:!!raw.providesHardening, size:raw.size||0, installLocation:raw.installLocation||'', installedItems:{allowed:true,allowedTypes:['itemUpgrade','program'],list:raw.installedItems?.list||[],slots:raw.installedItems?.slots||0,usedSlots:raw.installedItems?.usedSlots||0}, price:{market:raw.price||0}, quality:raw.quality||'standard', revealed:raw.revealed??true, source:raw.source||{book:'Core',page:0}, description:{value:raw.description||''} };
      break;
    }
  }
  return sys;
}

/** Create an Item document with proper system data */
async function createItemDocument(e) {
  const systemData = mapItemData(e.type, e.data || {});
  return Item.create({ name: e.name, type: e.type, system: systemData, img: e.img });
}

/** Process JSON payload: Items, Actors, RollTables */
async function processImportPayload(raw) {
  const entries = Array.isArray(raw) ? raw : [raw];
  for (const entry of entries) {
    validateEntity(entry);
    if (entry.entityType === 'Item') {
      await createItemDocument(entry);
    } else if (entry.entityType === 'Actor') {
      const actor = await Actor.create({ name: entry.name, type: entry.type, system: { stats: entry.data.stats, role: entry.data.role, reputation: entry.data.reputation || 0 }, img: entry.img });
      const items = [];
      (entry.data.weapons || []).forEach(w => items.push({ type: 'weapon', name: w.name, data: w, img: w.img }));
      if (entry.data.armor) items.push({ type: 'armor', name: entry.data.armor.name, data: entry.data.armor, img: entry.data.armor.img });
      ['gear','cyberware','upgrades','programs','architecture','vehicle','clothing','critical','skill','role','cyberdeck','ammo'].forEach(key => {
        (entry.data[key] || []).forEach(i => items.push({ type: key, name: i.name || i, data: i, img: i.img }));
      });
      const embedded = items.map(i => ({ name: i.name, type: i.type, system: mapItemData(i.type, i.data || {}), img: i.img }));
      await actor.createEmbeddedDocuments('Item', embedded);
      if (entry.data.skills) await actor.update({ 'system.skills': entry.data.skills });
    } else if (entry.entityType === 'RollTable') {
      await RollTable.create({ name: entry.name, img: entry.img, results: entry.results });
    }
  }
  ui.notifications.info('Whale Importer | Import complete');
}

/** Import dialog **/
class WhaleImportDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, { id: 'whale-importer-dialog', title: 'Import from The Whale', template: 'modules/whale-importer/templates/import-dialog.html', width: 600, closeOnSubmit: true });
  }
  getData() { return {}; }
  async _updateObject() {
    const raw = this.element.find('textarea[name="json-input"]').val();
    try { const payload = JSON.parse(raw); await processImportPayload(payload); }
    catch (err) { ui.notifications.error('Import failed: ' + err.message); }
  }
}