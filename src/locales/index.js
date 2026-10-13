import viData from './vi.json';
import enData from './en.json';
import zhData from './zh.json';

/**
 * Per-module dictionaries: src/locales/modules/<module>.<lang>.json
 * (e.g. heat.vi.json). They are merged over the base files so modules can ship
 * their translations without editing the shared vi/en/zh.json.
 */
const moduleFiles = import.meta.glob('./modules/*.json', { eager: true });

const merge = (lang, base) => {
  const merged = { ...base };
  Object.keys(moduleFiles)
    .filter((path) => path.endsWith(`.${lang}.json`))
    .sort()
    .forEach((path) => Object.assign(merged, moduleFiles[path].default || moduleFiles[path]));
  return merged;
};

export default {
  vi: merge('vi', viData),
  en: merge('en', enData),
  zh: merge('zh', zhData),
};
