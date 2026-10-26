import { useState, useMemo, useEffect } from 'react';
import {
  ALL_MODULES,
  CATEGORIES,
  CATEGORY_COLORS,
  CategoryType,
  ModuleEntry,
  BankConfig,
  saveBankConfig,
  DEFAULT_BANK_CONFIG
} from './moduleRegistry';
import './MasterCatalogModal.css';

interface MasterCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankConfig: BankConfig;
  onUpdateBankConfig: (config: BankConfig) => void;
  activeLayerId: string | null;
  onAddModuleToLayer: (mod: ModuleEntry) => void;
  initialCategory?: CategoryType | 'All';
}

export function MasterCatalogModal({
  isOpen,
  onClose,
  bankConfig,
  onUpdateBankConfig,
  activeLayerId,
  onAddModuleToLayer,
  initialCategory = 'All'
}: MasterCatalogModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | 'All'>(initialCategory);

  // Sync initialCategory when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedCategory(initialCategory);
      setSearchQuery('');
    }
  }, [isOpen, initialCategory]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Set of all module IDs currently pinned to the bank
  const pinnedIds = useMemo(() => {
    const set = new Set<string>();
    for (const cat of CATEGORIES) {
      bankConfig[cat]?.order.forEach(id => set.add(id));
    }
    return set;
  }, [bankConfig]);

  // Filtered module list
  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_MODULES.filter(mod => {
      // Category filter
      if (selectedCategory !== 'All' && mod.category !== selectedCategory) {
        return false;
      }
      // Text search
      if (!q) return true;
      const matchName = mod.label.toLowerCase().includes(q) || mod.id.toLowerCase().includes(q);
      const matchTooltip = mod.tooltip.toLowerCase().includes(q);
      const matchTags = mod.tags.some(t => t.toLowerCase().includes(q));
      return matchName || matchTooltip || matchTags;
    });
  }, [searchQuery, selectedCategory]);

  const togglePin = (mod: ModuleEntry) => {
    const cat = mod.category;
    const catConfig = bankConfig[cat] || { order: [], sort: 'custom' };
    const isIn = catConfig.order.includes(mod.id);

    let nextOrder: string[];
    if (isIn) {
      nextOrder = catConfig.order.filter(id => id !== mod.id);
    } else {
      nextOrder = [...catConfig.order, mod.id];
    }

    const nextConfig: BankConfig = {
      ...bankConfig,
      [cat]: {
        ...catConfig,
        order: nextOrder
      }
    };
    onUpdateBankConfig(nextConfig);
    saveBankConfig(nextConfig);
  };

  const handleResetDefaults = () => {
    if (window.confirm("Reset Module Bank to the default curated loadout?")) {
      const reset = JSON.parse(JSON.stringify(DEFAULT_BANK_CONFIG));
      onUpdateBankConfig(reset);
      saveBankConfig(reset);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="catalog-backdrop" onClick={onClose}>
      <div className="catalog-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="catalog-header">
          <div className="catalog-header-title">
            <span className="catalog-icon">📚</span>
            <h2>MASTER MODULE CATALOG</h2>
            <span className="catalog-count-pill">{ALL_MODULES.length} Available</span>
          </div>
          <button className="catalog-close-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="catalog-toolbar">
          <div className="catalog-search-box">
            <span className="catalog-search-icon">🔍</span>
            <input
              type="text"
              autoFocus
              placeholder="Search by module name, tags (e.g. 'cv', 'warp', 'vocal'), or description..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="catalog-clear-search" onClick={() => setSearchQuery('')}>
                ✕
              </button>
            )}
          </div>

          <div className="catalog-category-tabs">
            <button
              className={`cat-tab ${selectedCategory === 'All' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('All')}
            >
              All ({ALL_MODULES.length})
            </button>
            {CATEGORIES.map(cat => {
              const count = ALL_MODULES.filter(m => m.category === cat).length;
              const color = CATEGORY_COLORS[cat];
              return (
                <button
                  key={cat}
                  className={`cat-tab ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    borderBottomColor: selectedCategory === cat ? color : 'transparent',
                    color: selectedCategory === cat ? color : undefined
                  }}
                >
                  <span className="cat-dot" style={{ background: color }} />
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Line Items List */}
        <div className="catalog-list">
          {filteredModules.length === 0 ? (
            <div className="catalog-empty">
              No modules match your search for "{searchQuery}". Try searching for another keyword or tag.
            </div>
          ) : (
            filteredModules.map(mod => {
              const isPinned = pinnedIds.has(mod.id);
              const catColor = CATEGORY_COLORS[mod.category];

              return (
                <div key={mod.id} className="catalog-row">
                  {/* Left: Icon glyph */}
                  <div className="catalog-row-icon" style={{ borderColor: catColor + '55' }}>
                    {mod.glyph === 'RGB_STRIPES' ? (
                      <div className="rgb-stripes-icon small">
                        <div className="stripe red" />
                        <div className="stripe green" />
                        <div className="stripe blue" />
                      </div>
                    ) : (
                      <span className="glyph-char">{mod.glyph}</span>
                    )}
                  </div>

                  {/* Middle: Details */}
                  <div className="catalog-row-info">
                    <div className="catalog-row-title-line">
                      <span className="mod-label">{mod.label}</span>
                      <span className="mod-id-sub">({mod.id})</span>
                      <span
                        className="cat-badge"
                        style={{ background: catColor + '20', color: catColor, borderColor: catColor + '50' }}
                      >
                        {mod.category}
                      </span>
                    </div>
                    <div className="mod-desc">{mod.tooltip}</div>
                    <div className="mod-tags">
                      {mod.tags.map(tag => (
                        <span
                          key={tag}
                          className="tag-pill"
                          onClick={() => setSearchQuery(tag)}
                          title={`Search for '${tag}'`}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="catalog-row-actions">
                    <button
                      className={`btn-pin ${isPinned ? 'pinned' : ''}`}
                      onClick={() => togglePin(mod)}
                      title={isPinned ? 'Remove from Sidebar Bank' : 'Pin to Sidebar Bank'}
                    >
                      {isPinned ? '★ In Bank' : '☆ + Bank'}
                    </button>
                    <button
                      className="btn-add-layer"
                      disabled={!activeLayerId}
                      onClick={() => {
                        onAddModuleToLayer(mod);
                        onClose();
                      }}
                      title={activeLayerId ? `Add ${mod.label} directly to active layer` : 'Select a layer to add'}
                    >
                      + Add to Layer
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="catalog-footer">
          <div className="catalog-footer-left">
            Showing {filteredModules.length} of {ALL_MODULES.length} modules
            {!activeLayerId && <span className="layer-hint"> (Select a layer to enable instant "+ Add to Layer")</span>}
          </div>
          <button className="btn-reset-defaults" onClick={handleResetDefaults}>
            ↺ Reset Bank to Default Loadout
          </button>
        </div>
      </div>
    </div>
  );
}
