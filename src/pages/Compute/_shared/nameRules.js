import { t } from '@/core/i18n';
import { nameRule } from '@/components/form/rules';

/*
 * Legacy components/FormItem/NameInput variants (utils/validate nameTypeValidate) used by the
 * compute / storage forms. The generic "input-name" rule lives in components/form/rules (nameRule);
 * the keypair and image variants are kept here until they move to the shared rules module.
 */

// eslint-disable-next-line no-useless-escape
const KEYPAIR_NAME_RE = /^[a-zA-Z][\w_-]{0,127}$/;
// eslint-disable-next-line no-useless-escape
const IMAGE_NAME_RE = /^[a-zA-Z一-龥][一-龥\w"'\[\].()_-]{0,127}$/;

const regexRule = (re, messageKey) => ({
  validator: (_, value) => {
    if (value === undefined || value === null || value === '') return Promise.resolve();
    if (re.test(String(value))) return Promise.resolve();
    return Promise.reject(new Error(`${t('Invalid: ')}${t(messageKey)}`));
  },
});

/** legacy NameInput isKeypair (keypairNameValidate) */
export const keypairNameRule = () =>
  regexRule(
    KEYPAIR_NAME_RE,
    'The name should start with upper letter, lower letter, and be a string of 1 to 128, characters can only contain "0-9, a-z, A-Z, -, _".'
  );

/** legacy NameInput isImage (imageNameValidate) */
export const imageNameRule = () =>
  regexRule(
    IMAGE_NAME_RE,
    'The name should start with upper letter, lower letter or chinese, and be a string of 1 to 128, characters can only contain "0-9, a-z, A-Z, "-\'_()[].".'
  );

/** legacy NameInput `names`: "Name can not be duplicated" */
export const uniqueNameRule = (names = [], current) => ({
  validator: (_, value) => {
    if (value && value !== current && (names || []).includes(value)) {
      return Promise.reject(new Error(`${t('Invalid: ')}${t('Name can not be duplicated')}`));
    }
    return Promise.resolve();
  },
});

/** form field rules for a legacy `type: 'input-name'` item */
export const inputNameRules = (opts) => [nameRule(opts)];

export { nameRule };
