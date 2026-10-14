import React, { useEffect, useMemo, useState } from 'react';
import { Input, Select, Space } from 'antd';
import { t, useLocaleStore } from '@/core/i18n';

/**
 * Port of legacy components/FormItem/InternationalPhoneNumberInput (+ countries.js) and
 * utils/validate phoneNumberValidate, without libphonenumber: a calling-code select plus a
 * digits input. The value is the legacy string `+<code> <national number>`.
 * Country names come from the browser (Intl.DisplayNames) in the current UI language.
 */
export const CALLING_CODES = {
  1: ['US', 'AG', 'AI', 'AS', 'BB', 'BM', 'BS', 'CA', 'DM', 'DO', 'GD', 'GU', 'JM', 'KN', 'KY', 'LC', 'MP', 'MS', 'PR', 'SX', 'TC', 'TT', 'VC', 'VG', 'VI'],
  7: ['RU', 'KZ'],
  20: ['EG'],
  27: ['ZA'],
  30: ['GR'],
  31: ['NL'],
  32: ['BE'],
  33: ['FR'],
  34: ['ES'],
  36: ['HU'],
  39: ['IT', 'VA'],
  40: ['RO'],
  41: ['CH'],
  43: ['AT'],
  44: ['GB', 'GG', 'IM', 'JE'],
  45: ['DK'],
  46: ['SE'],
  47: ['NO', 'SJ'],
  48: ['PL'],
  49: ['DE'],
  51: ['PE'],
  52: ['MX'],
  53: ['CU'],
  54: ['AR'],
  55: ['BR'],
  56: ['CL'],
  57: ['CO'],
  58: ['VE'],
  60: ['MY'],
  61: ['AU', 'CC', 'CX'],
  62: ['ID'],
  63: ['PH'],
  64: ['NZ'],
  65: ['SG'],
  66: ['TH'],
  81: ['JP'],
  82: ['KR'],
  84: ['VN'],
  86: ['CN'],
  90: ['TR'],
  91: ['IN'],
  92: ['PK'],
  93: ['AF'],
  94: ['LK'],
  95: ['MM'],
  98: ['IR'],
  212: ['MA', 'EH'],
  213: ['DZ'],
  216: ['TN'],
  218: ['LY'],
  220: ['GM'],
  221: ['SN'],
  222: ['MR'],
  223: ['ML'],
  224: ['GN'],
  225: ['CI'],
  226: ['BF'],
  227: ['NE'],
  228: ['TG'],
  229: ['BJ'],
  230: ['MU'],
  231: ['LR'],
  232: ['SL'],
  233: ['GH'],
  234: ['NG'],
  235: ['TD'],
  236: ['CF'],
  237: ['CM'],
  238: ['CV'],
  240: ['GQ'],
  241: ['GA'],
  242: ['CG'],
  244: ['AO'],
  245: ['GW'],
  246: ['IO'],
  248: ['SC'],
  249: ['SD'],
  250: ['RW'],
  251: ['ET'],
  252: ['SO'],
  253: ['DJ'],
  254: ['KE'],
  255: ['TZ'],
  256: ['UG'],
  257: ['BI'],
  258: ['MZ'],
  260: ['ZM'],
  261: ['MG'],
  262: ['RE', 'YT'],
  263: ['ZW'],
  264: ['NA'],
  265: ['MW'],
  266: ['LS'],
  267: ['BW'],
  268: ['SZ'],
  269: ['KM'],
  291: ['ER'],
  297: ['AW'],
  298: ['FO'],
  299: ['GL'],
  350: ['GI'],
  351: ['PT'],
  352: ['LU'],
  353: ['IE'],
  354: ['IS'],
  355: ['AL'],
  356: ['MT'],
  357: ['CY'],
  358: ['FI', 'AX'],
  359: ['BG'],
  371: ['LV'],
  372: ['EE'],
  373: ['MD'],
  374: ['AM'],
  375: ['BY'],
  376: ['AD'],
  377: ['MC'],
  378: ['SM'],
  380: ['UA'],
  385: ['HR'],
  386: ['SI'],
  387: ['BA'],
  420: ['CZ'],
  421: ['SK'],
  423: ['LI'],
  500: ['FK'],
  501: ['BZ'],
  502: ['GT'],
  503: ['SV'],
  504: ['HN'],
  505: ['NI'],
  506: ['CR'],
  507: ['PA'],
  509: ['HT'],
  590: ['GP', 'BL', 'MF'],
  591: ['BO'],
  592: ['GY'],
  593: ['EC'],
  594: ['GF'],
  595: ['PY'],
  596: ['MQ'],
  597: ['SR'],
  598: ['UY'],
  672: ['NF'],
  673: ['BN'],
  674: ['NR'],
  675: ['PG'],
  676: ['TO'],
  677: ['SB'],
  678: ['VU'],
  679: ['FJ'],
  680: ['PW'],
  681: ['WF'],
  682: ['CK'],
  685: ['WS'],
  687: ['NC'],
  688: ['TV'],
  689: ['PF'],
  690: ['TK'],
  691: ['FM'],
  692: ['MH'],
  850: ['KP'],
  852: ['HK'],
  853: ['MO'],
  855: ['KH'],
  856: ['LA'],
  880: ['BD'],
  886: ['TW'],
  960: ['MV'],
  961: ['LB'],
  962: ['JO'],
  963: ['SY'],
  964: ['IQ'],
  965: ['KW'],
  966: ['SA'],
  967: ['YE'],
  968: ['OM'],
  970: ['PS'],
  971: ['AE'],
  972: ['IL'],
  973: ['BH'],
  974: ['QA'],
  975: ['BT'],
  976: ['MN'],
  977: ['NP'],
  992: ['TJ'],
  993: ['TM'],
  994: ['AZ'],
  995: ['GE'],
  996: ['KG'],
  998: ['UZ'],
};

const LOCALE_TAGS = { vi: 'vi', en: 'en', zh: 'zh-Hans' };
/** default calling code for a new number (legacy defaulted to +86) */
// Vietnamese deployment: +84 regardless of UI language (legacy always used +86)
const DEFAULT_PREFIX = { vi: '+84', zh: '+86', en: '+84' };

export const defaultPhonePrefix = () => DEFAULT_PREFIX[useLocaleStore.getState().locale] || '+84';

const regionNamer = (locale) => {
  try {
    const dn = new Intl.DisplayNames([LOCALE_TAGS[locale] || locale || 'en'], { type: 'region' });
    return (code) => {
      try {
        return dn.of(code) || code;
      } catch {
        return code;
      }
    };
  } catch {
    return (code) => code;
  }
};

export const phoneCountryOptions = (locale) => {
  const name = regionNamer(locale);
  return Object.keys(CALLING_CODES).map((code) => ({
    label: `+${code} ${CALLING_CODES[code].map(name).join(', ')}`,
    value: `+${code}`,
  }));
};

const codesByLength = Object.keys(CALLING_CODES).sort((a, b) => b.length - a.length);

/** split '+84 912345678' / '+84912345678' / '0084 91..' into { prefix, number } */
export const splitPhone = (raw, fallbackPrefix = defaultPhonePrefix()) => {
  const str = String(raw || '').trim();
  if (!str) return { prefix: fallbackPrefix, number: '' };
  const spaced = str.match(/^\+(\d{1,3})\s+([\d\s().-]*)$/);
  if (spaced && CALLING_CODES[spaced[1]]) {
    return { prefix: `+${spaced[1]}`, number: spaced[2].replace(/\D/g, '') };
  }
  let digits = str.replace(/[^\d+]/g, '');
  const international = digits.startsWith('+') || digits.startsWith('00');
  digits = digits.replace(/^\+|^00/, '').replace(/\D/g, '');
  if (international) {
    const code = codesByLength.find((c) => digits.startsWith(c));
    if (code) return { prefix: `+${code}`, number: digits.slice(code.length) };
  }
  // national format: drop the trunk prefix 0 (libphonenumber did the same)
  return { prefix: fallbackPrefix, number: digits.replace(/^0+/, '') };
};

/** legacy Edit: parsePhoneNumberFromString -> `+${countryCallingCode} ${nationalNumber}` */
export const normalizePhone = (raw, fallbackPrefix) => {
  if (!raw) return raw;
  const { prefix, number } = splitPhone(raw, fallbackPrefix);
  return number ? `${prefix} ${number}` : raw;
};

/** legacy phoneNumberValidate (E.164: known calling code, at most 15 digits) */
export const isPhoneNumber = (value) => {
  const m = String(value || '').match(/^\+(\d{1,3}) (\d+)$/);
  if (!m || !CALLING_CODES[m[1]]) return false;
  const total = m[1].length + m[2].length;
  return m[2].length >= 4 && total <= 15;
};

export const phoneNumberRule = ({ required = false } = {}) => ({
  validator(_, value) {
    if (!value) {
      return required ? Promise.reject(new Error(t('Please enter a valid Phone Number'))) : Promise.resolve();
    }
    if (isPhoneNumber(value)) return Promise.resolve();
    return Promise.reject(new Error(t('Please enter a valid Phone Number')));
  },
});

/** legacy InternationalPhoneNumberInput: value '+84 912345678' ('' while the number is empty) */
export function PhoneInput({ value, onChange, disabled }) {
  const locale = useLocaleStore((s) => s.locale);
  const options = useMemo(() => phoneCountryOptions(locale), [locale]);
  const initial = splitPhone(value);
  const [prefix, setPrefix] = useState(initial.prefix);
  const [number, setNumber] = useState(initial.number);

  useEffect(() => {
    if (!value) {
      setNumber('');
      return;
    }
    const next = splitPhone(value, prefix);
    setPrefix(next.prefix);
    setNumber(next.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (p, n) => {
    if (onChange) onChange(n ? `${p} ${n}` : '');
  };

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Select
        showSearch
        value={prefix}
        disabled={disabled}
        style={{ width: '45%' }}
        popupMatchSelectWidth={false}
        options={options}
        optionFilterProp="label"
        onChange={(val) => {
          setPrefix(val);
          emit(val, number);
        }}
      />
      <Input
        value={number}
        disabled={disabled}
        inputMode="tel"
        style={{ width: '55%' }}
        placeholder={t('Phone')}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          setNumber(digits);
          emit(prefix, digits);
        }}
      />
    </Space.Compact>
  );
}
