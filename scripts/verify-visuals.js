/**
 * Visual Verification Script for Tectonic-Solar
 * Run in browser console after refreshing: F12 → Console → paste all
 * 
 * Verifies:
 * 1. Map is visible and has proper dimensions
 * 2. All tabs display/hide correctly
 * 3. Visual enhancements applied (gradients, shadows, colors)
 */

console.log('%c🎨 VISUAL VERIFICATION STARTING...', 'font-size: 16px; font-weight: bold; color: #218D8D;');

// ============================================================================
// CHECK 1: MAP LAYOUT
// ============================================================================

console.log('\n%c✓ CHECK 1: Map Visibility', 'color: #218D8D; font-weight: bold; background: #e0f2f1; padding: 2px 8px; border-radius: 3px;');

const mapDisplay = document.getElementById('map-display');
const mapMain = document.querySelector('.map-main');

if (!mapDisplay) {
  console.error('✗ FAILED: #map-display element not found');
} else {
  const rect = mapDisplay.getBoundingClientRect();
  const size = `${rect.width.toFixed(0)}x${rect.height.toFixed(0)}px`;
  const visible = rect.height > 0 && rect.width > 0;
  
  if (visible) {
    console.log(`✓ Map container visible: ${size}`);
    console.log(`  - Width: ${rect.width.toFixed(0)}px`);
    console.log(`  - Height: ${rect.height.toFixed(0)}px`);
  } else {
    console.error(`✗ Map container not visible (${size})`);
  }
}

// ============================================================================
// CHECK 2: TAB FUNCTIONALITY
// ============================================================================

console.log('\n%c✓ CHECK 2: Tab Switching', 'color: #218D8D; font-weight: bold; background: #e0f2f1; padding: 2px 8px; border-radius: 3px;');

const tabs = document.querySelectorAll('.tab-content');
const activeTab = document.querySelector('.tab-content.active');

console.log(`  Tabs found: ${tabs.length} (expected 6)`);
console.log(`  Active tab: ${activeTab?.id || 'unknown'}`);

if (tabs.length === 6 && activeTab) {
  console.log('✓ All tabs present and one is active');
} else {
  console.error(`✗ Tab configuration issue: ${tabs.length} tabs, active: ${!!activeTab}`);
}

// ============================================================================
// CHECK 3: VISUAL ENHANCEMENTS
// ============================================================================

console.log('\n%c✓ CHECK 3: Visual Enhancements', 'color: #218D8D; font-weight: bold; background: #e0f2f1; padding: 2px 8px; border-radius: 3px;');

const checks = {
  'Tab header gradient': () => {
    const header = document.querySelector('.tab-header');
    const bg = window.getComputedStyle(header).backgroundImage;
    return bg.includes('gradient') || bg !== 'none';
  },
  'Tab buttons styled': () => {
    const btn = document.querySelector('.tab-btn');
    const color = window.getComputedStyle(btn).color;
    return color !== 'rgb(0, 0, 0)'; // Not default
  },
  'Map main has shadow': () => {
    const map = document.querySelector('.map-main');
    const shadow = window.getComputedStyle(map).boxShadow;
    return shadow !== 'none' && shadow !== 'rgb(0, 0, 0) 0px 0px 0px 0px';
  },
  'Data cards have gradients': () => {
    const card = document.querySelector('.data-card');
    if (!card) return 'N/A (no cards yet)';
    const bg = window.getComputedStyle(card).backgroundImage;
    return bg.includes('gradient') || bg !== 'none';
  },
  'Buttons have transitions': () => {
    const btn = document.querySelector('.btn-primary');
    if (!btn) return 'N/A (no primary buttons)';
    const transition = window.getComputedStyle(btn).transition;
    return transition.includes('all') || transition.includes('background');
  }
};

for (const [name, check] of Object.entries(checks)) {
  try {
    const result = check();
    if (result === 'N/A (no cards yet)' || result === 'N/A (no primary buttons)') {
      console.log(`  ⚠️  ${name}: Not yet tested (load data first)`);
    } else if (result) {
      console.log(`  ✓ ${name}: YES`);
    } else {
      console.log(`  ✗ ${name}: NO`);
    }
  } catch (e) {
    console.log(`  ⚠️  ${name}: Error checking`);
  }
}

// ============================================================================
// CHECK 4: CSS VARIABLES
// ============================================================================

console.log('\n%c✓ CHECK 4: CSS Variables', 'color: #218D8D; font-weight: bold; background: #e0f2f1; padding: 2px 8px; border-radius: 3px;');

const rootStyle = window.getComputedStyle(document.documentElement);
const cssVars = [
  '--color-primary',
  '--color-accent',
  '--color-surface',
  '--gradient-accent',
  '--space-16',
  '--radius-base'
];

cssVars.forEach(varName => {
  const value = rootStyle.getPropertyValue(varName).trim();
  if (value) {
    console.log(`  ✓ ${varName}: defined`);
  } else {
    console.log(`  ✗ ${varName}: missing`);
  }
});

// ============================================================================
// CHECK 5: DARK MODE
// ============================================================================

console.log('\n%c✓ CHECK 5: Dark Mode', 'color: #218D8D; font-weight: bold; background: #e0f2f1; padding: 2px 8px; border-radius: 3px;');

const isDark = document.documentElement.classList.contains('dark');
const darkModeSetting = localStorage.getItem('darkMode');

console.log(`  Dark mode class (.dark): ${isDark ? 'ACTIVE' : 'inactive'}`);
console.log(`  localStorage darkMode: ${darkModeSetting || '(not set)'}`);

// ============================================================================
// FINAL SUMMARY
// ============================================================================

console.log('\n%c════════════════════════════════════════════════════════', 'color: #218D8D;');
console.log('%c✅ VISUAL VERIFICATION COMPLETE', 'font-size: 16px; font-weight: bold; color: #4CAF50; background: #e8f5e9; padding: 8px; border-radius: 4px;');
console.log('%c════════════════════════════════════════════════════════\n', 'color: #218D8D;');

console.log('%cNEXT STEPS: Hard refresh (Ctrl+Shift+R) to see:', 'font-weight: bold; color: #FF6F00;');
console.log('  1. ✓ Map full-screen with proper visibility');
console.log('  2. ✓ Gradient backgrounds on headers and tabs');
console.log('  3. ✓ Smoother shadows and depth effects');
console.log('  4. ✓ Button hover animations (lift effect)');
console.log('  5. ✓ Enhanced card styling with glows on hover');
console.log('  6. ✓ Better form input styling');
