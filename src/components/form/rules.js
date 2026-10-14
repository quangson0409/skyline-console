import { t } from '@/core/i18n';

/* Form validation rules shared by several modules (ports of legacy utils/validate) */

/* ------------------------------ password ------------------------------ */
const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\\[\]`~!@#$%^&*><()_\-+=?:"{}|,.\\/;'])[A-Za-z\d\\[\]`~!@#$%^&*><()_\-+=?:"{}|,.\\/;']{8,32}$/;

/** legacy getPasswordOtherRule('password', type) */
export const passwordRule = ({ oldPasswordField, withoutPrefix } = {}) => ({ getFieldValue }) => ({
  validator(_, value) {
    const prefix = withoutPrefix ? '' : t('Invalid: ');
    if (!value) return Promise.resolve();
    if (!passwordRegex.test(value)) {
      return Promise.reject(
        new Error(
          prefix +
            t('8 to 32 characters, at least one uppercase letter, one lowercase letter, one number and one special character.')
        )
      );
    }
    const old = oldPasswordField ? getFieldValue(oldPasswordField) : undefined;
    if (old && value === old) {
      return Promise.reject(new Error(prefix + t('The new password cannot be identical to the current password.')));
    }
    return Promise.resolve();
  },
});

/** legacy getPasswordOtherRule('confirmPassword') */
export const confirmPasswordRule = ({ withoutPrefix } = {}) => ({ getFieldValue }) => ({
  validator(_, value) {
    const password = getFieldValue('password');
    if (password && value !== password) {
      return Promise.reject(
        new Error((withoutPrefix ? '' : t('Invalid: ')) + t('Password must be the same with confirm password.'))
      );
    }
    return Promise.resolve();
  },
});

/* ------------------------------ names ------------------------------ */
/** legacy "input-name" withoutChinese */
export const noChineseRule = () => ({
  validator: (_r, value) =>
    value && /[一-龥]/.test(value)
      ? Promise.reject(new Error(t('The name cannot contain Chinese characters.')))
      : Promise.resolve(),
});

/* ------------------------------ JSON ------------------------------ */
/** JSON validator (legacy utils/validate jsonValidator) */
export const jsonRule = () => ({
  validator: (_, v) => {
    if (v === undefined || v === null || v === '') return Promise.resolve();
    try {
      JSON.parse(v);
      return Promise.resolve();
    } catch {
      return Promise.reject(new Error(t('Please enter JSON in the correct format!')));
    }
  },
});
