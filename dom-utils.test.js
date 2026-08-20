/**
 * @jest-environment jsdom
 */

const {
  normalizeMatchText,
  getCountryAliases,
  findMatchingOptionIndex,
  fillSelect,
  selectCountry,
  findCountrySelect
} = require('./dom-utils.js');

describe('normalizeMatchText', () => {
  test.each([
    ['Saudi Arabia', 'saudi arabia'],
    ['  SAUDI   ARABIA  ', 'saudi arabia'],
    ['Saudi Arabia, Kingdom of', 'saudi arabia kingdom of'],
    ['السعودية', 'السعوديه'],
    ['المملكة العربية السعودية', 'المملكه العربيه السعوديه'],
    ['مِصْرُ', 'مصر'],
    ['أحمد', 'احمد']
  ])('normalizeMatchText("%s") → "%s"', (input, expected) => {
    expect(normalizeMatchText(input)).toBe(expected);
  });
});

describe('getCountryAliases', () => {
  test('returns Saudi Arabia aliases for various inputs', () => {
    const inputs = [
      'Saudi Arabia',
      'saudi',
      'KSA',
      'SAU',
      'SA',
      'السعودية',
      'المملكة العربية السعودية',
      'سعودية'
    ];

    inputs.forEach(input => {
      const aliases = getCountryAliases(input);
      expect(aliases).toContain('saudi arabia');
      expect(aliases).toContain('saudi');
      expect(aliases).toContain('ksa');
    });
  });
});

describe('findMatchingOptionIndex & selectCountry', () => {
  let selectEl;

  beforeEach(() => {
    selectEl = document.createElement('select');
    const options = [
      { value: '', text: '-- Select Country --' },
      { value: 'AFG', text: 'Afghanistan' },
      { value: 'EGY', text: 'Egypt' },
      { value: 'SAU', text: 'SAUDI ARABIA, KINGDOM OF' },
      { value: 'USA', text: 'United States' }
    ];

    options.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.value;
      el.textContent = opt.text;
      selectEl.appendChild(el);
    });
  });

  test.each([
    ['Saudi Arabia', 3, 'SAU'],
    ['saudi', 3, 'SAU'],
    ['KSA', 3, 'SAU'],
    ['SAU', 3, 'SAU'],
    ['السعودية', 3, 'SAU'],
    ['المملكة العربية السعودية', 3, 'SAU'],
    ['سعودية', 3, 'SAU'],
    ['Egypt', 2, 'EGY'],
    ['مصر', 2, 'EGY']
  ])('selectCountry successfully selects index and updates value for input "%s"', (input, expectedIndex, expectedValue) => {
    const success = selectCountry(selectEl, input);
    expect(success).toBe(true);
    expect(selectEl.selectedIndex).toBe(expectedIndex);
    expect(selectEl.value).toBe(expectedValue);
    expect(selectEl.options[expectedIndex].selected).toBe(true);
  });

  test('returns false when country is not present in options', () => {
    const success = selectCountry(selectEl, 'NonExistentCountry');
    expect(success).toBe(false);
  });
});

describe('findCountrySelect discovery', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('finds select by ID pattern ddlCountry', () => {
    const sel = document.createElement('select');
    sel.id = 'ctl00_cphMain_ddlCountry';
    document.body.appendChild(sel);

    expect(findCountrySelect()).toBe(sel);
  });

  test('finds select via associated label', () => {
    const label = document.createElement('label');
    label.htmlFor = 'customCountryField';
    label.textContent = 'Country / البلد:';
    const sel = document.createElement('select');
    sel.id = 'customCountryField';

    document.body.appendChild(label);
    document.body.appendChild(sel);

    expect(findCountrySelect()).toBe(sel);
  });

  test('finds select by scanning country-like options when ID is generic', () => {
    const sel = document.createElement('select');
    sel.id = 'field_123';
    const opt1 = document.createElement('option');
    opt1.text = 'Afghanistan';
    const opt2 = document.createElement('option');
    opt2.text = 'Saudi Arabia';
    sel.appendChild(opt1);
    sel.appendChild(opt2);
    document.body.appendChild(sel);

    expect(findCountrySelect()).toBe(sel);
  });
});
